const express = require("express");
const {
  createListing,
  getAllListings,
  getListingById,
  updateListing,
  deleteListing,
} = require("../Controller/listingController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Create a new listing
router.post("/", authMiddleware, createListing);

// Get all listings
router.get("/", getAllListings);

// Get a single listing by ID
router.get("/:id", getListingById);

// Update a listing by ID
router.put("/:id", authMiddleware, updateListing);

// Delete a listing by ID
router.delete("/:id", authMiddleware, deleteListing);

module.exports = router;