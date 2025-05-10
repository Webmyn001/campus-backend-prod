const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: [3, "Name must be at least 3 characters long"],
  },
  course: {
    type: String,
    required: [true, "Course is required"],
  },

  level: {
    type: String,
    required: [true, "Course is required"],
  },

  review: {
    type: String,
    required: [true, "Review is required"],
    minlength: [10, "Review must be at least 10 characters long"],
    maxlength: [500, "Review cannot exceed 500 characters"],
  },
  
  ratings: {
    type: Number,
    required: [true, "Rating is required"],
    min: [1, "Rating must be at least 1"],
    max: [5, "Rating cannot exceed 5"],
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the created date
  },
});

const Review = mongoose.model("Review", reviewSchema);
module.exports = Review;