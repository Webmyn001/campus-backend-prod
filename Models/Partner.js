const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ["jumia", "temu"],
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    websiteUrl: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    // Live integrations stay in demo mode until official access is granted.
    integrationStatus: {
      type: String,
      enum: ["demo", "live"],
      default: "demo",
    },
    affiliateProgramName: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Partner || mongoose.model("Partner", partnerSchema);
