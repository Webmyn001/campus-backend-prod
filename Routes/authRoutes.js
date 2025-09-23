const express = require("express");
const {
  signup,
  login,
  getAllUsers,
  updateUser,
  getUserById,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword
} = require("../Controller/authController");

const router = express.Router();

// ===== Authentication Routes =====

// Signup Route
router.post("/signup", signup);

// Login Route
router.post("/login", login);

// Verify Email Route
router.get("/verify-email", verifyEmail);

// Resend Verification Email
router.post("/resend-verification-email", resendVerificationEmail);

// Forgot Password
router.post("/forgot-password", forgotPassword);

// Reset Password
router.post("/reset-password", resetPassword);

// ===== User Management Routes =====

// Get All Users
router.get("/users", getAllUsers);

// Update User by ID
router.put("/:id", updateUser);

// Get Individual User by ID
router.get("/:id", getUserById);

module.exports = router;
