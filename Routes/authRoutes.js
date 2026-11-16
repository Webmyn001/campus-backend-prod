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
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: "auth",
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "admin-login",
});

// ===== Authentication Routes =====

// Signup Route
router.post("/signup", authLimiter, signup);

// Login Route
router.post("/login", authLimiter, login);

// Google Auth Route
router.post("/google", authLimiter, googleAuth);

// Verify Email Route
router.get("/verify-email", verifyEmail);

// Resend Verification Email
router.post("/resend-verification-email", authLimiter, resendVerificationEmail);

// Forgot Password
router.post("/forgot-password", authLimiter, forgotPassword);

// Reset Password
router.post("/reset-password", authLimiter, resetPassword);

// Admin Login
router.post("/admin-login", adminLoginLimiter, adminLogin);

// Get All Users (admin only)
router.get("/users", authMiddleware, adminMiddleware, getAllUsers);


module.exports = router;
