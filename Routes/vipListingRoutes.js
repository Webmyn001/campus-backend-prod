const express = require("express");
const {
  createVIPListing,
  getVIPListings,
  getVIPListingById,
  updateVIPListing,
  deleteVIPListing,
} = require("../Controller/vipListingController");
const authMiddleware = require("../Middleware/auth");
const optionalAuth = require("../Middleware/optionalAuth");

const router = express.Router();

// Create a new VIP listing
router.post("/", authMiddleware, createVIPListing);

// Get all VIP listings (admins also see pending)
router.get("/", optionalAuth, getVIPListings);

// Get a single VIP listing by ID
router.get("/:id", optionalAuth, getVIPListingById);

// Update a VIP listing by ID
router.put("/:id", authMiddleware, updateVIPListing);

// Delete a VIP listing by ID
router.delete("/:id", authMiddleware, deleteVIPListing);

module.exports = router;