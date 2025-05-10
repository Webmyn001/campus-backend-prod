const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
  profilePic: {
    type: String, // URL to an image
    default: "https://example.com/default-profile-pic.jpg", // Default profile picture
  },
  fullName: {
    type: String,
    required: [true, "Full name is required"],
    minlength: [3, "Full name must be at least 3 characters long"],
  },
  phoneNumber: {
    type: String,
    required: [true, "Phone number is required"],
    match: [/^\d{10,15}$/, "Please enter a valid phone number"], // Allows 10-15 digit numbers
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    match: [/.+\@.+\..+/, "Please enter a valid email address"],
  },
  courseOfStudy: {
    type: String,
    required: [true, "Course of study is required"],
  },
  yearOfStudy: {
    type: Number,
    required: [true, "Year of study is required"],
    min: [1, "Year of study must be at least 1"],
    max: [10, "Year of study cannot exceed 10"], // For long-term courses
  },
  hostelAddress: {
    type: String,
    required: [true, "Hostel address is required"],
  },
  emergencyContact: {
    type: String,
    required: [true, "Emergency contact is required"],
    match: [/^\d{10,15}$/, "Please enter a valid emergency contact number"],
  },
  bio: {
    type: String,
    maxlength: [200, "Bio cannot exceed 200 characters"],
  },
  dob: {
    type: Date, // Date of birth
    required: [true, "Date of birth is required"],
  },
  status: {
    type: String,
    enum: ["active", "inactive", "pending"],
    default: "active",
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the created date
  },
});

const Profile = mongoose.model("Profile", profileSchema);
module.exports = Profile;