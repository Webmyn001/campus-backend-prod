const mongoose = require("mongoose");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const User = require("../Models/User");
const { escapeRegex, isObjectId } = require("../utils/security");
const {
  getSellerId,
  isOwnerOrAdmin,
  normalizeListingImages,
  removeCloudinaryImages,
  text,
} = require("../utils/listings");

const CREATE_FIELDS = [
  "title",
  "category",
  "price",
  "condition",
  "description",
  "contactMethod",
  "type",
  "saleType",
  "institution",
  "institutionCode",
  "campaign",
  "campaignId",
  "priceAmount",
  "originalPriceAmount",
  "quantity",
  "workingCondition",
  "conditionNote",
  "pickupLocation",
  "deliveryAvailable",
  "deliveryFee",
  "deliveryArrangement",
];

const UPDATE_FIELDS = [
  ...CREATE_FIELDS,
  "soldOut",
  "listingState",
];

const ADMIN_ONLY_FIELDS = [
  "status",
  "approvalNote",
  "isManaged",
  "isUserVerified",
  "ownerName",
  "ownerLocation",
  "sellerInfo",
];

const TEXT_LIMITS = {
  title: 120,
  category: 60,
  price: 30,
  condition: 50,
  description: 5000,
  contactMethod: 200,
  type: 30,
  saleType: 30,
  institution: 120,
  institutionCode: 20,
  campaign: 120,
  workingCondition: 120,
  conditionNote: 500,
  pickupLocation: 200,
  deliveryArrangement: 500,
  approvalNote: 500,
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
    if (field === "priceAmount" || field === "deliveryFee" || field === "originalPriceAmount") {
      const value = Number(body[field]);
      if (Number.isFinite(value) && value >= 0) update[field] = value;
      continue;
    }
    if (field === "quantity") {
      const value = Number(body[field]);
      if (Number.isInteger(value) && value >= 0 && value <= 9999) update[field] = value;
      continue;
    }
    if (field === "deliveryAvailable") {
      update[field] = body[field] === true || body[field] === "true";
      continue;
    }
    if (field === "soldOut" || field === "isManaged" || field === "isUserVerified") {
      update[field] = body[field] === true || body[field] === "true";
      continue;
    }
    if (field === "campaignId") {
      if (isObjectId(body[field])) update[field] = body[field];
      continue;
    }
    if (field === "listingState") {
      if (["active", "reserved", "sold", "archived", "suspended"].includes(body[field])) {
        update[field] = body[field];
      }
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

function resolveSellerInfo(req, raw, { requireMatch = true } = {}) {
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

// Create a new listing
exports.createListing = async (req, res) => {
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

  const listedPrice = Number(payload.price) || Number(payload.priceAmount) || 0;
  if (payload.originalPriceAmount !== undefined) {
    if (!(payload.originalPriceAmount > listedPrice)) {
      return res.status(400).json({ message: "Original price must be higher than the selling price." });
    }
  }
  if (payload.quantity === undefined) payload.quantity = 1;
  if (payload.quantity < 1) {
    return res.status(400).json({ message: "Quantity must be at least 1." });
  }
  if (!payload.priceAmount && listedPrice > 0) payload.priceAmount = listedPrice;

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

    const listing = await Listing.create({
      ...payload,
      category: payload.category || "Other Goods",
      images,
      sellerInfo,
      school_name: sellerInfo.school_name,
      location_city: sellerInfo.location_city,
      isUserVerified,
      isManaged: req.user.role === "admin" && req.body.isManaged === true,
      ownerName: req.user.role === "admin" ? text(req.body.ownerName, 120) || "" : "",
      ownerLocation: req.user.role === "admin" ? text(req.body.ownerLocation, 120) || "" : "",
      status: "pending",
    });

    res.status(201).json({ message: "Listing created successfully", listing });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid listing data." });
    }
    console.error("Create Listing Error:", error.message);
    res.status(500).json({ message: "Failed to create listing" });
  }
};

// Get all listings
exports.getAllListings = async (req, res) => {
  try {
    const query = req.user && req.user.role === "admin" ? {} : { status: { $ne: "pending" } };
    const listings = await Listing.find(query).sort({ postedAt: -1 });
    res.status(200).json(listings);
  } catch (error) {
    console.error("Get Listings Error:", error.message);
    res.status(500).json({ message: "Failed to fetch listings" });
  }
};

// Get a single listing by ID
exports.getListingById = async (req, res) => {
  const { id } = req.params;

  try {
    let listing = null;
    if (isObjectId(id)) {
      listing = await Listing.findById(id);
    } else if (/^[a-fA-F0-9]{10}$/.test(id)) {
      listing = await Listing.findOne({
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
      return res.status(404).json({ message: "Listing not found" });
    }

    if (listing.status === "pending" || listing.status === "rejected") {
      if (!isOwnerOrAdmin(req, listing)) {
        return res.status(404).json({ message: "Listing not found" });
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
    console.error("Get Listing Error:", error.message);
    res.status(500).json({ message: "Failed to fetch listing" });
  }
};

// Update a listing
exports.updateListing = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid listing ID." });
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const admin = req.user.role === "admin";
    if (!isOwnerOrAdmin(req, listing)) {
      return res.status(403).json({ message: "Not authorized to update this listing." });
    }

    const updates = buildUpdate(req.body, UPDATE_FIELDS);
    if (admin) Object.assign(updates, buildUpdate(req.body, ADMIN_ONLY_FIELDS));

    if (updates.price !== undefined) {
      const parsed = Number(updates.price);
      if (Number.isFinite(parsed) && parsed >= 0) updates.priceAmount = parsed;
    }

    if (updates.quantity !== undefined) updates.soldOut = updates.quantity <= 0;

    const nextPrice =
      updates.priceAmount !== undefined
        ? updates.priceAmount
        : Number(listing.priceAmount ?? listing.price) || 0;
    const nextOriginal =
      updates.originalPriceAmount !== undefined
        ? updates.originalPriceAmount
        : listing.originalPriceAmount;
    if (nextOriginal !== undefined && nextOriginal !== null && !(nextOriginal > nextPrice)) {
      return res
        .status(400)
        .json({ message: "Original price must be higher than the selling price." });
    }

    // Marking an item sold / changing stock is stock management, not a content
    // change, so the owner doesn't have to wait for re-approval.
    const stockOnly =
      Object.keys(updates).length > 0 &&
      Object.keys(updates).every((key) => key === "soldOut" || key === "quantity");

    if (!admin && !stockOnly) {
      updates.status = "pending";
      updates.isUserVerified = listing.isUserVerified;
    }

    let replacedImages = false;
    if (req.body.images !== undefined) {
      updates.images = await normalizeListingImages(req.body.images, "listings");
      replacedImages = true;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No permitted fields to update." });
    }

    const updated = await Listing.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (replacedImages && listing.images?.length) {
      const kept = new Set((updated.images || []).map((img) => img.public_id));
      await removeCloudinaryImages(listing.images.filter((img) => !kept.has(img.public_id)));
    }

    res.status(200).json({ message: "Listing updated successfully", listing: updated });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid listing data." });
    }
    console.error("Update Listing Error:", error.message);
    res.status(500).json({ message: "Failed to update listing" });
  }
};

// Delete a listing
exports.deleteListing = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid listing ID." });
  }

  try {
    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    if (!isOwnerOrAdmin(req, listing)) {
      return res.status(403).json({ message: "Not authorized to delete this listing." });
    }

    await removeCloudinaryImages(listing.images);
    await listing.deleteOne();

    const Analytics = require("../Models/Analytics");
    await Analytics.deleteMany({ productId: id }).catch(() => {});

    res.status(200).json({ message: "Listing deleted successfully" });
  } catch (error) {
    console.error("Delete Listing Error:", error.message);
    res.status(500).json({ message: "Failed to delete listing" });
  }
};

// Get current user's listings (Aggregated)
exports.getMyListings = async (req, res) => {
  try {
    const userId = req.user.id;

    const [communityListings, featuredListings] = await Promise.all([
      Listing.find({
        $or: [{ "sellerInfo.id": userId }, { "sellerInfo._id": userId }, { sellerInfo: userId }],
      }).sort({ postedAt: -1 }),
      VipListing.find({
        $or: [{ "sellerInfo.id": userId }, { "sellerInfo._id": userId }, { sellerInfo: userId }],
      }).sort({ postedAt: -1 }),
    ]);

    res.status(200).json({ featured: featuredListings, community: communityListings });
  } catch (error) {
    console.error("Get My Listings Error:", error.message);
    res.status(500).json({ message: "Failed to fetch your listings" });
  }
};
