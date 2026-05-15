const mongoose = require("mongoose");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const User = require("../Models/User");
const cloudinary = require("../config/cloudinary");

require("dotenv").config();




// Create a new listing (auto-delete after 1 hour)

exports.createListing = async (req, res) => {
  const { title, category, price, condition, description, images, contactMethod, sellerInfo, isManaged, ownerName, ownerLocation } = req.body;

  try {
    let uploadedImages = [];
    if (images && images.length > 0) {
      const uploadPromises = images.map((base64Image) =>
        cloudinary.uploader.upload(base64Image, { folder: "listings" })
      );
      const results = await Promise.all(uploadPromises);

      uploadedImages = results.map((r) => ({
        url: r.secure_url,
        public_id: r.public_id,
      }));
    }

    let isUserVerified = false;
    const sellerId = sellerInfo?.id || sellerInfo?._id;
    if (sellerId === "official_campuscrave_id") {
      isUserVerified = true;
    } else if (sellerId) {
      try {
        const user = await User.findById(sellerId);
        isUserVerified = user ? !!user.isUserVerified : false;
      } catch (err) {
        console.warn("Invalid seller ID format:", sellerId);
      }
    }

    // const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); //3dayshrs


    const listing = await Listing.create({
      title,
      category: category || "Other Goods",
      price,
      condition,
      description,
      images: uploadedImages, // ✅ now matches schema
      contactMethod,
      sellerInfo,
      school_name: sellerInfo?.school_name,
      location_city: sellerInfo?.location_city,
      isUserVerified,
      isManaged: isManaged || false,
      ownerName: ownerName || "",
      ownerLocation: ownerLocation || "",
      // expiresAt,
    });

    res.status(201).json({ message: "Listing created successfully", listing });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create listing", error });
  }
};

// Get all listings
exports.getAllListings = async (req, res) => {
  try {
    const listings = await Listing.find();
    res.status(200).json(listings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch listings", error });
  }
};

// Get a single listing by ID
exports.getListingById = async (req, res) => {
  const { id } = req.params;

  try {
    let listing = await Listing.findById(id);

    if (!listing && id.length === 10) {
      // Fallback: search by short ID (last 10 characters of MongoDB _id)
      listing = await Listing.findOne({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: id + "$",
            options: "i"
          }
        }
      });
    }

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Fetch Seller Views (Store Views)
    const sellerId = listing.sellerInfo?.id || listing.sellerInfo?._id || listing.sellerInfo;
    let sellerViews = 0;
    if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
        const seller = await User.findById(sellerId).select("views");
        sellerViews = seller ? (seller.views || 0) : 0;
    } else if (sellerId === "official_campuscrave_id" || 
               listing.sellerInfo?.username === "campuscrave" || 
               listing.sellerInfo?.name === "CampusCrave Official") {
        // Find the official account views from both User and Settings
        try {
            const [seller, setting] = await Promise.all([
                User.findOne({ 
                    $or: [{ username: "campuscrave" }, { name: "CampusCrave Official" }] 
                }).select("views"),
                require("../Models/Setting").findOne({ key: "official_store_views" })
            ]);
            
            const userViews = seller ? (seller.views || 0) : 0;
            const settingViews = setting ? (setting.value || 0) : 0;
            
            // Use the higher value or setting views as the source of truth for official store
            sellerViews = Math.max(userViews, settingViews);
        } catch (err) {
            console.error("Error fetching official store views:", err);
        }
    }

    res.status(200).json({ ...listing.toObject(), sellerViews });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch listing", error });
  }
};

// Update a listing
exports.updateListing = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const listing = await Listing.findByIdAndUpdate(id, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validations are applied
    });

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    res.status(200).json({ message: "Listing updated successfully", listing });
  } catch (error) {
    res.status(500).json({ message: "Failed to update listing", error });
  }
};


// Delete a listing
exports.deleteListing = async (req, res) => {
  const { id } = req.params;

  try {
    // Find the listing first
    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Delete images from Cloudinary if any
    if (listing.images && listing.images.length > 0) {
      await Promise.all(
        listing.images.map((img) => cloudinary.uploader.destroy(img.public_id))
      );
    }

    // Delete the listing from MongoDB
    await Listing.findByIdAndDelete(id);

    res.status(200).json({ message: "Listing deleted successfully" });
  } catch (error) {
    console.error("DeleteListing Error:", error);
    res.status(500).json({ message: "Failed to delete listing", error });
  }
};

// Get current user's listings (Aggregated)
exports.getMyListings = async (req, res) => {
  try {
    const userId = req.user.id;

    const [communityListings, featuredListings] = await Promise.all([
      Listing.find({
        $or: [
          { "sellerInfo.id": userId },
          { "sellerInfo._id": userId },
          { "sellerInfo": userId }
        ]
      }).sort({ createdAt: -1 }),
      VipListing.find({
        $or: [
          { "sellerInfo.id": userId },
          { "sellerInfo._id": userId },
          { "sellerInfo": userId }
        ]
      }).sort({ createdAt: -1 })
    ]);

    res.status(200).json({
      featured: featuredListings,
      community: communityListings
    });
  } catch (error) {
    console.error("❌ getMyListings Error:", error);
    res.status(500).json({ message: "Failed to fetch your listings", error });
  }
};
