const mongoose = require("mongoose");

// Seller payout records. payoutReference is unique -> an idempotency key so a
// duplicated webhook/retry/admin action can never pay a seller twice.
const marketplacePayoutSchema = new mongoose.Schema(
  {
    payoutReference: {
      type: String,
      unique: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketplaceOrder",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 }, // seller payout amount
    platformFee: { type: Number, default: 0, min: 0 }, // commission retained
    currency: { type: String, default: "NGN" },

    // Paystack transfer recipient / transfer
    recipientCode: { type: String },
    transferCode: { type: String },
    transferReference: { type: String, sparse: true },

    status: {
      type: String,
      enum: ["pending", "initiated", "processed", "paid", "failed", "paused", "cancelled"],
      default: "pending",
      index: true,
    },
    failureReason: { type: String, trim: true },
    initiatedAt: { type: Date },
    paidAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

marketplacePayoutSchema.index({ sellerId: 1, createdAt: -1 });
marketplacePayoutSchema.index({ orderId: 1 });

marketplacePayoutSchema.set("toJSON", { virtuals: true });
marketplacePayoutSchema.set("toObject", { virtuals: true });

module.exports =
  mongoose.models.MarketplacePayout ||
  mongoose.model("MarketplacePayout", marketplacePayoutSchema);