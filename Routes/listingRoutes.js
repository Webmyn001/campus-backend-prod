const express = require("express");
const {
  createListing,
  getAllListings,
  getListingById,
  updateListing,
  deleteListing,
  getMyListings,
} = require("../Controller/listingController");
const authMiddleware = require("../Middleware/auth");
const optionalAuth = require("../Middleware/optionalAuth");

const router = express.Router();

// Create a new listing
router.post("/", authMiddleware, createListing);

// Get all listings (admins also see pending)
router.get("/", optionalAuth, getAllListings);

// Get current user's listings
router.get("/mine", authMiddleware, getMyListings);

// Get a single listing by ID
router.get("/:id", optionalAuth, getListingById);

// Update a listing by ID
router.put("/:id", authMiddleware, updateListing);

// Delete a listing by ID
router.delete("/:id", authMiddleware, deleteListing);

module.exports = router;