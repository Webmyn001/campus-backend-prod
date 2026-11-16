const Review = require("../Models/Review");
const { sanitizeText, isObjectId } = require("../utils/security");

// Create a new review
exports.createReview = async (req, res) => {
  const name = sanitizeText(req.body.name, 80);
  const course = sanitizeText(req.body.course, 120);
  const level = sanitizeText(req.body.level, 60);
  const review = sanitizeText(req.body.review, 500);
  const ratings = Number(req.body.ratings);

  if (!name || name.length < 3 || !course || !level) {
    return res.status(400).json({ message: "Name, course and level are required." });
  }
  if (!review || review.length < 10) {
    return res.status(400).json({ message: "Review must be at least 10 characters long." });
  }
  if (!Number.isInteger(ratings) || ratings < 1 || ratings > 5) {
    return res.status(400).json({ message: "Rating must be a whole number between 1 and 5." });
  }

  try {
    const newReview = await Review.create({ name, course, level, review, ratings });
    res.status(201).json({ message: "Review created successfully", newReview });
  } catch (error) {
    console.error("Create Review Error:", error.message);
    res.status(500).json({ message: "Failed to create review" });
  }
};

// Get all reviews
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (error) {
    console.error("Get All Reviews Error:", error.message);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
};

// Get a single review by ID
exports.getReviewById = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid review ID." });
  }

  try {
    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    res.status(200).json(review);
  } catch (error) {
    console.error("Get Review Error:", error.message);
    res.status(500).json({ message: "Failed to fetch review" });
  }
};

// Update a review (admin only)
exports.updateReview = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid review ID." });
  }

  const updates = {};
  const name = sanitizeText(req.body.name, 80);
  const course = sanitizeText(req.body.course, 120);
  const level = sanitizeText(req.body.level, 60);
  const review = sanitizeText(req.body.review, 500);
  if (name && name.length >= 3) updates.name = name;
  if (course) updates.course = course;
  if (level) updates.level = level;
  if (review && review.length >= 10) updates.review = review;
  if (req.body.ratings !== undefined) {
    const ratings = Number(req.body.ratings);
    if (!Number.isInteger(ratings) || ratings < 1 || ratings > 5) {
      return res.status(400).json({ message: "Rating must be a whole number between 1 and 5." });
    }
    updates.ratings = ratings;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No permitted fields to update." });
  }

  try {
    const updatedReview = await Review.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedReview) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.status(200).json({ message: "Review updated successfully", updatedReview });
  } catch (error) {
    console.error("Update Review Error:", error.message);
    res.status(500).json({ message: "Failed to update review" });
  }
};

// Delete a review (admin only)
exports.deleteReview = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid review ID." });
  }

  try {
    const deletedReview = await Review.findByIdAndDelete(id);

    if (!deletedReview) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error("Delete Review Error:", error.message);
    res.status(500).json({ message: "Failed to delete review" });
  }
};
