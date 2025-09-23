const VipListing = require("../Models/vipListing");

// Create a new VIP listing (auto-delete after 3 minutes)
exports.createVIPListing = async (req, res) => {
  const { title, price, condition, description, images, contactMethod, sellerInfo, postedTime } = req.body;

  try {
    // Set expiresAt to 3 minutes from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const listing = await VipListing.create({
      title,
      price,
      condition,
      description,
      images,
      contactMethod,
      postedTime,
      sellerInfo,
      expiresAt
    });

    res.status(201).json({ message: "VIP Listing created successfully", listing });
  } catch (error) {
    res.status(500).json({ message: "Failed to create VIP listing", error });
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