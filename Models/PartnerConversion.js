const mongoose = require("mongoose");

const CONVERSION_SOURCES = [
  "partner_api",
  "partner_webhook",
  "partner_report",
  "manual_import",
];

const partnerConversionSchema = new mongoose.Schema(
  {
    partner: {
      type: String,
      enum: ["jumia", "temu"],
      required: true,
      lowercase: true,
      index: true,
    },
    // Only populated when the partner report gives us a matching reference.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerProduct",
      default: null,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerCampaign",
      default: null,
      index: true,
    },
    clickId: { type: String, default: null, index: true },
    externalOrderId: { type: String, required: true, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: ["confirmed", "rejected"],
      default: "confirmed",
      index: true,
    },
    // Conversions are only ever recorded from an authorised partner API,
    // webhook or report — never from a click.
    source: {
      type: String,
      enum: CONVERSION_SOURCES,
      required: true,
    },
    orderAmount: { type: Number, default: null, min: 0 },
    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, "Currency must be a 3-letter code"],
    },
    commissionAmount: { type: Number, default: null, min: 0 },
    commissionCurrency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, "Currency must be a 3-letter code"],
    },
    confirmedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

partnerConversionSchema.index({ partner: 1, externalOrderId: 1 }, { unique: true });

const PartnerConversion =
  mongoose.models.PartnerConversion ||
  mongoose.model("PartnerConversion", partnerConversionSchema);

PartnerConversion.CONVERSION_SOURCES = CONVERSION_SOURCES;

module.exports = PartnerConversion;
