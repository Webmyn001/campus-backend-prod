const Profile = require("../Models/Profile");

// Create a new profile
exports.createProfile = async (req, res) => {
  const {
    profilePic,
    fullName,
    phoneNumber,
    email,
    courseOfStudy,
    yearOfStudy,
    hostelAddress,
    emergencyContact,
    bio,
    dob,
    status,
  } = req.body;

  try {
    const profile = await Profile.create({
      profilePic,
      fullName,
      phoneNumber,
      email,
      courseOfStudy,
      yearOfStudy,
      hostelAddress,
      emergencyContact,
      bio,
      dob,
      status,
    });

    res.status(201).json({ message: "Profile created successfully", profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to create profile", error });
  }
};

// Get all profiles
exports.getAllProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find();
    res.status(200).json(profiles);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profiles", error });
  }
};

// Get a single profile by ID
exports.getProfileById = async (req, res) => {
  const { id } = req.params;

  try {
    const profile = await Profile.findById(id);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile", error });
  }
};

// Update a profile
exports.updateProfile = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const profile = await Profile.findByIdAndUpdate(id, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validations are applied
    });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json({ message: "Profile updated successfully", profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error });
  }
};

// Delete a profile
exports.deleteProfile = async (req, res) => {
  const { id } = req.params;

  try {
    const profile = await Profile.findByIdAndDelete(id);

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json({ message: "Profile deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete profile", error });
  }
};