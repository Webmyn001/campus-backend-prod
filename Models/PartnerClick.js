const mongoose = require("mongoose");

const partnerClickSchema = new mongoose.Schema(
  {
    clickId: { type: String, required: true, unique: true, index: true },
    partner: {
      type: String,
      enum: ["jumia", "temu"],
      required: true,
      lowercase: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerProduct",
      required: true,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartnerCampaign",
      default: null,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ipHash: { type: String, default: "" },
    userAgent: { type: String, default: "", maxlength: 500 },
    referrer: { type: String, default: "", maxlength: 2048 },
    // Snapshot of the validated partner destination at click time.
    destinationUrl: { type: String, required: true, maxlength: 2048 },
    isDemo: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.PartnerClick || mongoose.model("PartnerClick", partnerClickSchema);
