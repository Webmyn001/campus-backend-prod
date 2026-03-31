const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema({
  date: {
    type: String, // format: YYYY-MM-DD
    required: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["listing", "viplisting"],
    required: true,
  },
  views: {
    type: Number,
    default: 0,
  },
  whatsappClicks: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Compound index for efficient daily product lookups
analyticsSchema.index({ date: 1, productId: 1 }, { unique: true });

const Analytics = mongoose.model("Analytics", analyticsSchema);

module.exports = Analytics;
