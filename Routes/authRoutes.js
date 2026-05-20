const express = require("express");
const {
  signup,
  login,
  googleAuth,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  adminLogin,
  getAllUsers
} = require("../Controller/authController");

const router = express.Router();

// ===== Authentication Routes =====

// Signup Route
router.post("/signup", signup);

// Login Route
router.post("/login", login);

// Google Auth Route
router.post("/google", googleAuth);

// Verify Email Route
router.get("/verify-email", verifyEmail);

// Resend Verification Email
router.post("/resend-verification-email", resendVerificationEmail);

// Forgot Password
router.post("/forgot-password", forgotPassword);

// Reset Password
router.post("/reset-password", resetPassword);

// Admin Login
router.post("/admin-login", adminLogin);

// Get All Users (Alias for frontend compatibility)
router.get("/users", getAllUsers);


module.exports = router;
