const Profile = require("../Models/Profile");
const { isObjectId, isNonEmptyString } = require("../utils/security");

const SELF_EDITABLE_FIELDS = [
  "profilePic",
  "fullName",
  "phoneNumber",
  "courseOfStudy",
  "yearOfStudy",
  "hostelAddress",
  "emergencyContact",
  "bio",
  "dob",
];

const isAdmin = (req) => req.user && req.user.role === "admin";

const isOwner = (req, profile) => {
  if (!req.user || !profile) return false;
  const ownerEmail = String(profile.email || "").toLowerCase();
  const userEmail = String(req.user.email || "").toLowerCase();
  return Boolean(ownerEmail) && ownerEmail === userEmail;
};

// Create a new profile
exports.createProfile = async (req, res) => {
  try {
    const email = String(req.user.email || "").toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Your account has no email address." });
    }

    const existing = await Profile.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "A profile already exists for this account." });
    }

    const payload = { email };
    for (const field of SELF_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    }

    const profile = await Profile.create(payload);
    res.status(201).json({ message: "Profile created successfully", profile });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A profile already exists for this account." });
    }
    console.error("Create Profile Error:", error.message);
    res.status(500).json({ message: "Failed to create profile" });
  }
};

// Get all profiles (admin only)
exports.getAllProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find();
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Get All Profiles Error:", error.message);
    res.status(500).json({ message: "Failed to fetch profiles" });
  }
};

// Get a single profile by ID
exports.getProfileById = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid profile ID." });
  }

  try {
    const profile = await Profile.findById(id);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (!isAdmin(req) && !isOwner(req, profile)) {
      return res.status(403).json({ message: "Not authorized to view this profile." });
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("Get Profile Error:", error.message);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

// Update a profile
exports.updateProfile = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid profile ID." });
  }

  try {
    const profile = await Profile.findById(id);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const admin = isAdmin(req);
    if (!admin && !isOwner(req, profile)) {
      return res.status(403).json({ message: "Not authorized to update this profile." });
    }

    const updates = {};
    for (const field of SELF_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (admin && req.body.status !== undefined) {
      updates.status = req.body.status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No permitted fields to update." });
    }

    const updated = await Profile.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ message: "Profile updated successfully", profile: updated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That email is already in use." });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid profile data." });
    }
    console.error("Update Profile Error:", error.message);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

// Delete a profile
exports.deleteProfile = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid profile ID." });
  }

  try {
    const profile = await Profile.findById(id);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (!isAdmin(req) && !isOwner(req, profile)) {
      return res.status(403).json({ message: "Not authorized to delete this profile." });
    }

    await profile.deleteOne();
    res.status(200).json({ message: "Profile deleted successfully" });
  } catch (error) {
    console.error("Delete Profile Error:", error.message);
    res.status(500).json({ message: "Failed to delete profile" });
  }
};
