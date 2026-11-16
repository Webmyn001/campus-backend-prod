const ProListing = require("../Models/Prolisting");
const User = require("../Models/User");
const { escapeRegex, isObjectId } = require("../utils/security");
const {
  isOwnerOrAdmin,
  normalizeListingImages,
  removeCloudinaryImages,
  text,
} = require("../utils/listings");

const CREATE_FIELDS = ["title", "price", "condition", "description", "contactMethod"];
const UPDATE_FIELDS = [...CREATE_FIELDS, "soldOut"];

const TEXT_LIMITS = {
  title: 120,
  price: 30,
  condition: 50,
  description: 5000,
  contactMethod: 200,
};

function buildUpdate(body, fields) {
  const update = {};
  for (const field of fields) {
    if (body[field] === undefined) continue;
    if (TEXT_LIMITS[field]) {
      const value = text(body[field], TEXT_LIMITS[field]);
      if (value !== undefined) update[field] = value;
      continue;
    }
    if (field === "soldOut") {
      update[field] = body[field] === true || body[field] === "true";
    }
  }
  return update;
}

function resolveSellerInfo(req, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const admin = req.user && req.user.role === "admin";
  const sellerId = raw.id || raw._id;

  if (!admin) {
    if (sellerId && String(sellerId) !== String(req.user.id)) return null;
    if (sellerId === "official_campuscrave_id") return null;
  }

  if (admin) return { ...raw };
  return { ...raw, id: req.user.id };
}

// Create a new pro listing
exports.createProListing = async (req, res) => {
  const sellerInfo = resolveSellerInfo(req, req.body.sellerInfo);
  if (!sellerInfo) {
    return res.status(403).json({ message: "Seller information does not match your account." });
  }

  const payload = buildUpdate(req.body, CREATE_FIELDS);
  if (!payload.title || !payload.price || !payload.condition || !payload.contactMethod) {
    return res.status(400).json({ message: "Title, price, condition and contact method are required." });
  }
  if (!payload.description || payload.description.length < 10) {
    return res.status(400).json({ message: "Description must be at least 10 characters long." });
  }

  try {
    const images = req.body.images ? await normalizeListingImages(req.body.images, "listings") : [];

    let isUserVerified = false;
    const sellerId = sellerInfo.id || sellerInfo._id;
    if (isObjectId(sellerId)) {
      const user = await User.findById(sellerId).select("isUserVerified");
      isUserVerified = user ? !!user.isUserVerified : false;
    }

    const listing = await ProListing.create({
      ...payload,
      images,
      sellerInfo,
      isUserVerified,
    });

    res.status(201).json({ message: "Pro Listing created successfully", listing });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid pro listing data." });
    }
    console.error("Create Pro Listing Error:", error.message);
    res.status(500).json({ message: "Failed to create pro listing" });
  }
};

// Get all pro listings
exports.getProListings = async (req, res) => {
  try {
    const listings = await ProListing.find();
    res.status(200).json(listings);
  } catch (error) {
    console.error("Get Pro Listings Error:", error.message);
    res.status(500).json({ message: "Failed to fetch pro listings" });
  }
};

// Get a single pro listing by ID
exports.getProListingById = async (req, res) => {
  const { id } = req.params;

  try {
    let listing = null;
    if (isObjectId(id)) {
      listing = await ProListing.findById(id);
    } else if (/^[a-fA-F0-9]{10}$/.test(id)) {
      listing = await ProListing.findOne({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: escapeRegex(id) + "$",
            options: "i",
          },
        },
      });
    }

    if (!listing) {
      return res.status(404).json({ message: "Pro Listing not found" });
    }
    res.status(200).json(listing);
  } catch (error) {
    console.error("Get Pro Listing Error:", error.message);
    res.status(500).json({ message: "Failed to fetch pro listing" });
  }
};

// Update a pro listing
exports.updateProListing = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid pro listing ID." });
  }

  try {
    const listing = await ProListing.findById(id);
    if (!listing) {
      return res.status(404).json({ message: "Pro Listing not found" });
    }

    if (!isOwnerOrAdmin(req, listing)) {
      return res.status(403).json({ message: "Not authorized to update this pro listing." });
    }

    const updates = buildUpdate(req.body, UPDATE_FIELDS);

    let replacedImages = false;
    if (req.body.images !== undefined) {
      updates.images = await normalizeListingImages(req.body.images, "listings");
      replacedImages = true;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No permitted fields to update." });
    }

    const updated = await ProListing.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (replacedImages && listing.images?.length) {
      const kept = new Set((updated.images || []).map((img) => img.public_id));
      await removeCloudinaryImages(listing.images.filter((img) => !kept.has(img.public_id)));
    }

    res.status(200).json({ message: "Pro Listing updated successfully", listing: updated });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid pro listing data." });
    }
    console.error("Update Pro Listing Error:", error.message);
    res.status(500).json({ message: "Failed to update pro listing" });
  }
};

// Delete a pro listing
exports.deleteProListing = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid pro listing ID." });
  }

  try {
    const listing = await ProListing.findById(id);
    if (!listing) {
      return res.status(404).json({ message: "Pro Listing not found" });
    }

    if (!isOwnerOrAdmin(req, listing)) {
      return res.status(403).json({ message: "Not authorized to delete this pro listing." });
    }

    await removeCloudinaryImages(listing.images);
    await listing.deleteOne();

    res.status(200).json({ message: "Pro Listing deleted successfully" });
  } catch (error) {
    console.error("Delete Pro Listing Error:", error.message);
    res.status(500).json({ message: "Failed to delete pro listing" });
  }
};
