const express = require("express");
const {
  createProfile,
  getAllProfiles,
  getProfileById,
  updateProfile,
  deleteProfile,
} = require("../Controller/profileController");

const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");

const router = express.Router();

// Create a new profile for the signed-in user
router.post("/", authMiddleware, createProfile);

// Get all profiles (admin only)
router.get("/", authMiddleware, adminMiddleware, getAllProfiles);

// Get a single profile by ID (owner or admin)
router.get("/:id", authMiddleware, getProfileById);

// Update a profile by ID (owner or admin)
router.put("/:id", authMiddleware, updateProfile);

// Delete a profile by ID (owner or admin)
router.delete("/:id", authMiddleware, deleteProfile);

module.exports = router;