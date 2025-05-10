const Review = require("../Models/Review");

// Create a new review
exports.createReview = async (req, res) => {
  const { name, course, review, ratings, level } = req.body;

  try {
    const newReview = await Review.create({
      name,
      course,
      level,
      review,
      ratings,
    });

    res.status(201).json({ message: "Review created successfully", newReview });
  } catch (error) {
    res.status(500).json({ message: "Failed to create review", error });
  }
};

// Get all reviews
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find();
    res.status(200).json(reviews);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch reviews", error });
  }
};

// Get a single review by ID
exports.getReviewById = async (req, res) => {
  const { id } = req.params;

  try {
    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    res.status(200).json(review);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch review", error });
  }
};

// Update a review
exports.updateReview = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const updatedReview = await Review.findByIdAndUpdate(id, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validations are applied
    });

    if (!updatedReview) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.status(200).json({ message: "Review updated successfully", updatedReview });
  } catch (error) {
    res.status(500).json({ message: "Failed to update review", error });
  }
};

// Delete a review
exports.deleteReview = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedReview = await Review.findByIdAndDelete(id);

    if (!deletedReview) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete review", error });
  }
};