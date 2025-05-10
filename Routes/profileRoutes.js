const express = require("express");
const {
  createProfile,
  getAllProfiles,
  getProfileById,
  updateProfile,
  deleteProfile,
} = require("../Controller/profileController");

const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Create a new profile
router.post("/", authMiddleware, createProfile);

// Get all profiles
router.get("/", authMiddleware, getAllProfiles);

// Get a single profile by ID
router.get("/:id", authMiddleware, getProfileById);

// Update a profile by ID
router.put("/:id", authMiddleware, updateProfile);

// Delete a profile by ID
router.delete("/:id", authMiddleware, deleteProfile);

module.exports = router;