const express = require("express");
const {
  createReview,
  getAllReviews,
  getReviewById,
  updateReview,
  deleteReview,
} = require("../Controller/reviewController");

const router = express.Router();

// Create a new review
router.post("/", createReview);

// Get all reviews
router.get("/", getAllReviews);

// Get a single review by ID
router.get("/:id", getReviewById);

// Update a review by ID
router.put("/:id", updateReview);

// Delete a review by ID
router.delete("/:id", deleteReview);

module.exports = router;