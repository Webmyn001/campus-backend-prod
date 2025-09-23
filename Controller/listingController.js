const Listing = require("../Models/Listing1");
const cloudinary = require("../config/cloudinary");

require("dotenv").config();




// Create a new listing (auto-delete after 1 hour)


exports.createListing = async (req, res) => {
  const { title, price, condition, description, images, contactMethod, sellerInfo } = req.body;

  try {
    let uploadedImages = [];
    if (images && images.length > 0) {
      const uploadPromises = images.map((base64Image) =>
        cloudinary.uploader.upload(base64Image, { folder: "listings" })
      );
      const results = await Promise.all(uploadPromises);
      uploadedImages = results.map((r) => r.secure_url);
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const listing = await Listing.create({
      title,
      price,
      condition,
      description,
      images: uploadedImages,
      contactMethod,
      sellerInfo,
      expiresAt,
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
    const listing = await Listing.findById(id).populate("seller", "email");
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }
    res.status(200).json(listing);
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
    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    // Delete images from Cloudinary (if any)
    if (listing.images && listing.images.length > 0) {
      const deletePromises = listing.images.map((imageUrl) => {
        // Extract public_id from the URL (e.g., "listings/abc123")
        const parts = imageUrl.split("/");
        const publicIdWithExt = parts[parts.length - 1];
        const publicId = `listings/${publicIdWithExt.split(".")[0]}`;

        return cloudinary.uploader.destroy(publicId);
      });

      await Promise.all(deletePromises);
    }

    // Delete the listing from MongoDB
    await Listing.findByIdAndDelete(id);

    res.status(200).json({ message: "Listing deleted successfully" });
  } catch (error) {
    console.error("DeleteListing Error:", error);
    res.status(500).json({ message: "Failed to delete listing", error });
  }
};