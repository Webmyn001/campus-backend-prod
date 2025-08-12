const ProListing = require("../Models/Prolisting");

// Create a new pro listing (auto-delete after 3 minutes)
exports.createProListing = async (req, res) => {
  const { title, price, condition, description, images, contactMethod, sellerInfo, postedTime } = req.body;

  try {
    // Set expiresAt to 3 minutes from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const listing = await ProListing.create({
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

    res.status(201).json({ message: "Pro Listing created successfully", listing });
  } catch (error) {
    res.status(500).json({ message: "Failed to create pro listing", error });
  }
};

// Get all pro listings
exports.getProListings = async (req, res) => {
  try {
    const listings = await ProListing.find();
    res.status(200).json(listings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch pro listings", error });
  }
};

// Get a single pro listing by ID
exports.getProListingById = async (req, res) => {
  const { id } = req.params;

  try {
    const listing = await ProListing.findById(id).populate("seller", "email");
    if (!listing) {
      return res.status(404).json({ message: "Pro Listing not found" });
    }
    res.status(200).json(listing);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch pro listing", error });
  }
};

// Update a pro listing
exports.updateProListing = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const listing = await ProListing.findByIdAndUpdate(id, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validations are applied
    });

    if (!listing) {
      return res.status(404).json({ message: "Pro Listing not found" });
    }

    res.status(200).json({ message: "Pro Listing updated successfully", listing });
  } catch (error) {
    res.status(500).json({ message: "Failed to update pro listing", error });
  }
};

// Delete a pro listing
exports.deleteProListing = async (req, res) => {
  const { id } = req.params;

  try {
    const listing = await ProListing.findByIdAndDelete(id);

    if (!listing) {
      return res.status(404).json({ message: "Pro Listing not found" });
    }

    res.status(200).json({ message: "Pro Listing deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete pro listing", error });
  }
};