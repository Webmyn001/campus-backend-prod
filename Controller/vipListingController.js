const mongoose = require("mongoose");
const VipListing = require("../Models/vipListing");
const User = require("../Models/User");
const cloudinary = require("../config/cloudinary");






// Create a new VIP listing (auto-delete after 3 minutes)
exports.createVIPListing = async (req, res) => {
  const {
    businessName,
    address,
    fullDescription,
    workingHours,
    businessEmail,
    images,
    category,
    contactMethod,
    sellerInfo,
    isManaged,
    ownerName,
    ownerLocation
  } = req.body;

  try {
    // Upload images to Cloudinary if any
    let uploadedImages = [];
    if (images && images.length > 0) {
      const uploadPromises = images.map((base64Image) =>
        cloudinary.uploader.upload(base64Image, { folder: "listings" })
      );

      const results = await Promise.all(uploadPromises);

      // Map results to match schema {url, public_id}
      uploadedImages = results.map((r) => ({
        url: r.secure_url,
        public_id: r.public_id
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

    // Set expiresAt to 1 hour from now (you can adjust)
    // const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days (1 month)


    const listing = await VipListing.create({
      businessName,
      category: category || "Other Services",
      address,
      fullDescription,
      workingHours,
      businessEmail,
      images: uploadedImages,
      contactMethod,
      sellerInfo,
      school_name: sellerInfo?.school_name,
      location_city: sellerInfo?.location_city,
      isUserVerified,
      isManaged: isManaged || false,
      ownerName: ownerName || "",
      ownerLocation: ownerLocation || "",
      // expiresAt
    });

    res.status(201).json({ message: "VIP Listing created successfully", listing });
  } catch (error) {
    console.error("❌ Failed to create VIP listing:", error);
    res.status(500).json({ message: "Failed to create VIP listing", error: error.message });
  }
};


// Get all VIP listings
exports.getVIPListings = async (req, res) => {
  try {
    const listings = await VipListing.find();
    res.status(200).json(listings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch VIP listings", error });
  }
};

// Get a single VIP listing by ID
exports.getVIPListingById = async (req, res) => {
  const { id } = req.params;

  try {
    let listing = await VipListing.findById(id);

    if (!listing && id.length === 10) {
      // Fallback: search by short ID (last 10 characters of MongoDB _id)
      listing = await VipListing.findOne({
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
      return res.status(404).json({ message: "VIP Listing not found" });
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
    res.status(500).json({ message: "Failed to fetch VIP listing", error });
  }
};

// Update a VIP listing
exports.updateVIPListing = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const listing = await VipListing.findByIdAndUpdate(id, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validations are applied
    });

    if (!listing) {
      return res.status(404).json({ message: "VIP Listing not found" });
    }

    res.status(200).json({ message: "VIP Listing updated successfully", listing });
  } catch (error) {
    res.status(500).json({ message: "Failed to update VIP listing", error });
  }
};

// Delete a VIP listing
exports.deleteVIPListing = async (req, res) => {
  const { id } = req.params;

  try {
    // Find and delete the listing
    const listing = await VipListing.findByIdAndDelete(id);

    if (!listing) {
      return res.status(404).json({ message: "VIP Listing not found" });
    }

    // Delete associated images from Cloudinary if any
    if (listing.images && listing.images.length > 0) {
      await Promise.all(
        listing.images.map((img) => cloudinary.uploader.destroy(img.public_id))
      );
    }

    res.status(200).json({ message: "VIP Listing deleted successfully" });
  } catch (error) {
    console.error("Error deleting VIP listing:", error);
    res.status(500).json({ message: "Failed to delete VIP listing", error });
  }
};