const mongoose = require("mongoose");
const VipListing = require("../Models/vipListing");
const User = require("../Models/User");
const { escapeRegex, isObjectId, normalizeEmail } = require("../utils/security");
const {
  getSellerId,
  isOwnerOrAdmin,
  normalizeListingImages,
  removeCloudinaryImages,
  text,
} = require("../utils/listings");

const CREATE_FIELDS = [
  "businessName",
  "category",
  "address",
  "fullDescription",
  "workingHours",
  "contactMethod",
];

const UPDATE_FIELDS = [...CREATE_FIELDS, "soldOut"];

const ADMIN_ONLY_FIELDS = [
  "status",
  "isUserVerified",
  "isManaged",
  "ownerName",
  "ownerLocation",
  "sellerInfo",
];

const TEXT_LIMITS = {
  businessName: 120,
  category: 60,
  address: 300,
  fullDescription: 6000,
  workingHours: 120,
  contactMethod: 200,
  ownerName: 120,
  ownerLocation: 120,
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
    if (field === "soldOut" || field === "isManaged" || field === "isUserVerified") {
      update[field] = body[field] === true || body[field] === "true";
      continue;
    }
    if (field === "status") {
      if (["pending", "approved", "rejected"].includes(body[field])) {
        update[field] = body[field];
      }
      continue;
    }
    if (field === "sellerInfo") {
      if (body[field] && typeof body[field] === "object" && !Array.isArray(body[field])) {
        update[field] = body[field];
      }
      continue;
    }
    update[field] = body[field];
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

// Create a new VIP listing
exports.createVIPListing = async (req, res) => {
  const sellerInfo = resolveSellerInfo(req, req.body.sellerInfo);
  if (!sellerInfo) {
    return res.status(403).json({ message: "Seller information does not match your account." });
  }

  const payload = buildUpdate(req.body, CREATE_FIELDS);
  const businessEmail = normalizeEmail(req.body.businessEmail);

  if (!payload.businessName || !payload.address || !payload.fullDescription || !payload.workingHours) {
    return res.status(400).json({
      message: "Business name, address, description and working hours are required.",
    });
  }
  if (!payload.contactMethod) {
    return res.status(400).json({ message: "Contact method is required." });
  }
  if (!businessEmail) {
    return res.status(400).json({ message: "A valid business email is required." });
  }
  if (payload.fullDescription.length < 20) {
    return res.status(400).json({ message: "Full description must be at least 20 characters." });
  }

  try {
    const images = req.body.images ? await normalizeListingImages(req.body.images, "listings") : [];

    let isUserVerified = false;
    const sellerId = sellerInfo.id || sellerInfo._id;
    if (sellerId === "official_campuscrave_id") {
      isUserVerified = true;
    } else if (isObjectId(sellerId)) {
      const user = await User.findById(sellerId).select("isUserVerified");
      isUserVerified = user ? !!user.isUserVerified : false;
    }

    const listing = await VipListing.create({
      ...payload,
      category: payload.category || "Other Services",
      businessEmail,
      images,
      sellerInfo,
      school_name: sellerInfo.school_name,
      location_city: sellerInfo.location_city,
      isUserVerified,
      isManaged: req.body.isManaged === true,
      ownerName: req.user.role === "admin" ? text(req.body.ownerName, 120) || "" : "",
      ownerLocation: req.user.role === "admin" ? text(req.body.ownerLocation, 120) || "" : "",
      status: "pending",
    });

    res.status(201).json({ message: "VIP Listing created successfully", listing });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid VIP listing data." });
    }
    console.error("Create VIP Listing Error:", error.message);
    res.status(500).json({ message: "Failed to create VIP listing" });
  }
};

// Get all VIP listings
exports.getVIPListings = async (req, res) => {
  try {
    const query = req.user && req.user.role === "admin" ? {} : { status: { $ne: "pending" } };
    const listings = await VipListing.find(query);
    res.status(200).json(listings);
  } catch (error) {
    console.error("Get VIP Listings Error:", error.message);
    res.status(500).json({ message: "Failed to fetch VIP listings" });
  }
};

// Get a single VIP listing by ID
exports.getVIPListingById = async (req, res) => {
  const { id } = req.params;

  try {
    let listing = null;
    if (isObjectId(id)) {
      listing = await VipListing.findById(id);
    } else if (/^[a-fA-F0-9]{10}$/.test(id)) {
      listing = await VipListing.findOne({
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
      return res.status(404).json({ message: "VIP Listing not found" });
    }

    if (listing.status === "pending" || listing.status === "rejected") {
      if (!isOwnerOrAdmin(req, listing)) {
        return res.status(404).json({ message: "VIP Listing not found" });
      }
    }

    const sellerId = getSellerId(listing);
    let sellerViews = 0;
    if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
      const seller = await User.findById(sellerId).select("views");
      sellerViews = seller ? seller.views || 0 : 0;
    } else if (
      sellerId === "official_campuscrave_id" ||
      listing.sellerInfo?.username === "campuscrave" ||
      listing.sellerInfo?.name === "CampusCrave Official"
    ) {
      const [seller, setting] = await Promise.all([
        User.findOne({
          $or: [{ username: "campuscrave" }, { name: "CampusCrave Official" }],
        }).select("views"),
        require("../Models/Setting").findOne({ key: "official_store_views" }),
      ]);
      const userViews = seller ? seller.views || 0 : 0;
      const settingViews = setting ? setting.value || 0 : 0;
      sellerViews = Math.max(userViews, settingViews);
    }

    res.status(200).json({ ...listing.toObject(), sellerViews });
  } catch (error) {
    console.error("Get VIP Listing Error:", error.message);
    res.status(500).json({ message: "Failed to fetch VIP listing" });
  }
};

// Update a VIP listing
exports.updateVIPListing = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid VIP listing ID." });
  }

  try {
    const listing = await VipListing.findById(id);
    if (!listing) {
      return res.status(404).json({ message: "VIP Listing not found" });
    }

    const admin = req.user.role === "admin";
    if (!isOwnerOrAdmin(req, listing)) {
      return res.status(403).json({ message: "Not authorized to update this VIP listing." });
    }

    const updates = buildUpdate(req.body, UPDATE_FIELDS);
    if (admin) Object.assign(updates, buildUpdate(req.body, ADMIN_ONLY_FIELDS));

    if (req.body.businessEmail !== undefined) {
      if (!admin) {
        return res.status(403).json({ message: "Business email cannot be changed here." });
      }
      const businessEmail = normalizeEmail(req.body.businessEmail);
      if (!businessEmail) {
        return res.status(400).json({ message: "A valid business email is required." });
      }
      updates.businessEmail = businessEmail;
    }

    if (!admin) updates.status = "pending";

    let replacedImages = false;
    if (req.body.images !== undefined) {
      updates.images = await normalizeListingImages(req.body.images, "listings");
      replacedImages = true;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No permitted fields to update." });
    }

    const updated = await VipListing.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (replacedImages && listing.images?.length) {
      const kept = new Set((updated.images || []).map((img) => img.public_id));
      await removeCloudinaryImages(listing.images.filter((img) => !kept.has(img.public_id)));
    }

    res.status(200).json({ message: "VIP Listing updated successfully", listing: updated });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid VIP listing data." });
    }
    console.error("Update VIP Listing Error:", error.message);
    res.status(500).json({ message: "Failed to update VIP listing" });
  }
};

// Delete a VIP listing
exports.deleteVIPListing = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid VIP listing ID." });
  }

  try {
    const listing = await VipListing.findById(id);
    if (!listing) {
      return res.status(404).json({ message: "VIP Listing not found" });
    }

    if (!isOwnerOrAdmin(req, listing)) {
      return res.status(403).json({ message: "Not authorized to delete this VIP listing." });
    }

    await removeCloudinaryImages(listing.images);
    await listing.deleteOne();

    const Analytics = require("../Models/Analytics");
    await Analytics.deleteMany({ productId: id }).catch(() => {});

    res.status(200).json({ message: "VIP Listing deleted successfully" });
  } catch (error) {
    console.error("Delete VIP Listing Error:", error.message);
    res.status(500).json({ message: "Failed to delete VIP listing" });
  }
};
