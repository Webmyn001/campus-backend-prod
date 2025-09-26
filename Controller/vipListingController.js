const VipListing = require("../Models/vipListing");
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
    contactMethod,
    sellerInfo
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

    // Set expiresAt to 1 hour from now (you can adjust)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const listing = await VipListing.create({
      businessName,
      address,
      fullDescription,
      workingHours,
      businessEmail,
      images: uploadedImages,
      contactMethod,
      sellerInfo,
      expiresAt
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
    const listing = await VipListing.findById(id)
    if (!listing) {
      return res.status(404).json({ message: "VIP Listing not found" });
    }
    res.status(200).json(listing);
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
    const listing = await VipListing.findByIdAndDelete(id);

    if (!listing) {
      return res.status(404).json({ message: "VIP Listing not found" });
    }

    res.status(200).json({ message: "VIP Listing deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete VIP listing", error });
  }
};