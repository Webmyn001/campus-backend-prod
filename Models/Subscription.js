const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  plan: { type: String, enum: ["starter", "standard", "premium"], required: true },
  amountPaid: { type: Number, required: true },
  currency: { type: String, default: "NGN" },
  paymentStatus: { type: String, enum: ["pending", "successful", "failed"], default: "pending" },
  flutterwaveTxId: { type: String },
  createdAt: { type: Date, default: Date.now },

  validityInterval: { type: Number, default: 30 }, // days
  expiresAt: { type: Date },
});

// Auto-calc expiresAt
subscriptionSchema.pre("save", function (next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(
      this.createdAt.getTime() + this.validityInterval * 24 * 60 * 60 * 1000
    );
  }
  next();
});

// ✅ Use module.exports instead of export default
module.exports =
  mongoose.models.Subscription ||
  mongoose.model("Subscription", subscriptionSchema, "userplans");
