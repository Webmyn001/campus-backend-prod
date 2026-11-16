const mongoose = require("mongoose");

const PARTNER_MODES = ["DISABLED", "JUMIA", "TEMU", "BOTH"];

const partnerSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "global",
      immutable: true,
    },
    mode: {
      type: String,
      enum: PARTNER_MODES,
      default: "DISABLED",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const PartnerSetting =
  mongoose.models.PartnerSetting || mongoose.model("PartnerSetting", partnerSettingSchema);

PartnerSetting.PARTNER_MODES = PARTNER_MODES;

module.exports = PartnerSetting;
