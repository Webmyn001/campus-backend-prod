const express = require("express");
const {
  createProListing,
  getProListings,
  getProListingById,
  updateProListing,
  deleteProListing,
} = require("../Controller/proListingController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Create a new Pro Tier listing
router.post("/", authMiddleware, createProListing);

// Get all Pro Tier listings
router.get("/", getProListings);

// Get a single Pro Tier listing by ID
router.get("/:id", getProListingById);

// Update a Pro Tier listing by ID
router.put("/:id", authMiddleware, updateProListing);

// Delete a Pro Tier listing by ID
router.delete("/:id", authMiddleware, deleteProListing);

module.exports = router;