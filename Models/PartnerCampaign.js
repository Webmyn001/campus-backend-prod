const mongoose = require("mongoose");

const partnerCampaignSchema = new mongoose.Schema(
  {
    partner: {
      type: String,
      enum: ["jumia", "temu"],
      required: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "ended"],
      default: "draft",
      index: true,
    },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    // Optional promotional banner shown on the Partner Deals storefront while
    // the campaign is active. Authored by admins; no partner claims attached.
    bannerTitle: { type: String, default: "", trim: true, maxlength: 120 },
    bannerSubtitle: { type: String, default: "", trim: true, maxlength: 240 },
    bannerImageUrl: { type: String, default: "", trim: true },
    bannerCtaLabel: { type: String, default: "", trim: true, maxlength: 40 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.PartnerCampaign || mongoose.model("PartnerCampaign", partnerCampaignSchema);
