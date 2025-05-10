const express = require("express");
const {
  createVIPListing,
  getVIPListings,
  getVIPListingById,
  updateVIPListing,
  deleteVIPListing,
} = require("../Controller/vipListingController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Create a new VIP listing
router.post("/", authMiddleware, createVIPListing);

// Get all VIP listings
router.get("/", getVIPListings);

// Get a single VIP listing by ID
router.get("/:id", getVIPListingById);

// Update a VIP listing by ID
router.put("/:id", authMiddleware, updateVIPListing);

// Delete a VIP listing by ID
router.delete("/:id", authMiddleware, deleteVIPListing);

module.exports = router;