const mongoose = require("mongoose");

const partnerProductSchema = new mongoose.Schema(
  {
    partner: {
      type: String,
      enum: ["jumia", "temu"],
      required: true,
      lowercase: true,
      index: true,
    },
    externalId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // "demo" products are illustrative catalogue entries. "live" products come
    // from an approved partner API/feed and carry verified price data.
    source: {
      type: String,
      enum: ["demo", "live"],
      default: "demo",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 5000 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    tags: [{ type: String, trim: true, maxlength: 50 }],

    imageUrl: { type: String, default: "", trim: true },
    images: [{ type: String, trim: true }],

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, "Currency must be a 3-letter code"],
    },
    // Demo entries intentionally carry no price so nothing is invented.
    price: { type: Number, default: null, min: 0 },
    originalPrice: { type: Number, default: null, min: 0 },
    availability: {
      type: String,
      enum: ["in_stock", "out_of_stock", "unknown"],
      default: "unknown",
    },
    priceVerifiedAt: { type: Date, default: null },
    // How the price/availability above was verified.
    priceSource: {
      type: String,
      enum: ["demo", "partner_api", "partner_feed", "manual_admin"],
      default: "demo",
    },

    // Approved partner page and (optional) approved affiliate link.
    productUrl: { type: String, default: "", trim: true },
    affiliateUrl: { type: String, default: "", trim: true },

    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerCampaign",
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["draft", "published", "unpublished"],
      default: "draft",
      index: true,
    },
    featured: { type: Boolean, default: false },

    clicks: { type: Number, default: 0, min: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

partnerProductSchema.index({ partner: 1, externalId: 1 }, { unique: true });
partnerProductSchema.index({ status: 1, partner: 1, createdAt: -1 });

module.exports =
  mongoose.models.PartnerProduct || mongoose.model("PartnerProduct", partnerProductSchema);
