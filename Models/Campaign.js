const mongoose = require("mongoose");

// A temporary marketplace campaign (e.g. "OAU Final-Year Quick Sale").
// Configurable so future universities/campaigns can be added without code changes.
const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Campaign name is required"],
    trim: true,
  },
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Institution",
    index: true,
  },
  institutionCode: {
    type: String,
    uppercase: true,
    trim: true,
    index: true,
  },
  institutionName: {
    type: String,
    trim: true,
  },
  saleType: {
    type: String,
    enum: ["final_year"],
    default: "final_year",
  },
  tagline: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  startDate: {
    type: Date,
    required: [true, "Start date is required"],
    index: true,
  },
  endDate: {
    type: Date,
    required: [true, "End date is required"],
    index: true,
  },
  // status can be managed manually; isEffective derives from dates
  status: {
    type: String,
    enum: ["upcoming", "active", "ended", "paused"],
    default: "active",
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Helper: returns the derived, date-aware status
campaignSchema.methods.effectiveStatus = function () {
  const now = new Date();
  if (this.status === "paused") return "paused";
  if (this.endDate && now > this.endDate) return "ended";
  if (this.startDate && now < this.startDate) return "upcoming";
  return this.status === "ended" ? "ended" : "active";
};

campaignSchema.methods.isAcceptingNewListings = function () {
  return this.effectiveStatus() === "active";
};

campaignSchema.set("toJSON", { virtuals: true });
campaignSchema.set("toObject", { virtuals: true });

module.exports =
  mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);