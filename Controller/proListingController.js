const Listing = require("../Models/Listing1");

// Create a new listing
exports.createProListing = async (req, res) => {
  const { title, price, condition, description, images, contactMethod, sellerInfo, postedTime } = req.body;

  try {
    const listing = await Listing.create({
      title,
      price,
      condition,
      description,
      images,
      contactMethod,
      postedTime,
      sellerInfo
    });

    res.status(201).json({ message: "Listing created successfully", listing });
  } catch (error) {
    res.status(500).json({ message: "Failed to create listing", error });
  }
};

// Get all listings
exports.getProListings = async (req, res) => {
  try {
    const listings = await Listing.find() // Populate seller's email
    res.status(200).json(listings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch listings", error });
  }
};

// Get a single listing by ID
exports.getProListingById = async (req, res) => {
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
exports.updateProListing = async (req, res) => {
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
exports.deleteProListing = async (req, res) => {
  const { id } = req.params;

  try {
    const listing = await Listing.findByIdAndDelete(id);

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    res.status(200).json({ message: "Listing deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete listing", error });
  }
};