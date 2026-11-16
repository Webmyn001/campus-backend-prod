const express = require("express");
const {
  createReview,
  getAllReviews,
  getReviewById,
  updateReview,
  deleteReview,
} = require("../Controller/reviewController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  prefix: "review-submit",
  message: "Too many reviews submitted. Please try again later.",
});

// Public reviews
router.post("/", submitLimiter, createReview);
router.get("/", getAllReviews);
router.get("/:id", getReviewById);

// Moderation
router.put("/:id", authMiddleware, adminMiddleware, updateReview);
router.delete("/:id", authMiddleware, adminMiddleware, deleteReview);

module.exports = router;
