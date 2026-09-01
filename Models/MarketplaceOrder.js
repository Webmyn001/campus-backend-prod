const mongoose = require("mongoose");

// Marketplace orders keep the subscription (userplans) ledger completely separate.
// transaction_type for these = "marketplace_purchase".
const marketplaceOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    buyerName: { type: String, trim: true },
    buyerEmail: { type: String, trim: true, lowercase: true },
    buyerPhone: { type: String, trim: true },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sellerName: { type: String, trim: true },
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", index: true },
    campaignName: { type: String, trim: true },
    institutionCode: { type: String, uppercase: true, trim: true, index: true },

    // Immutable snapshot of the purchased listing (accounting/audit safety)
    listingSnapshot: {
      title: { type: String, trim: true },
      image: { type: String },
      category: { type: String },
      condition: { type: String },
      priceAmount: { type: Number, default: 0 },
      sellerName: { type: String },
      pickupLocation: { type: String },
    },

    // ---- Money (all computed server-side) ----
    priceAmount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, default: 0, min: 0 }, // 1% retained by platform
    sellerAmount: { type: Number, default: 0, min: 0 }, // priceAmount - platformFee
    deliveryFee: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 }, // priceAmount + deliveryFee
    currency: { type: String, default: "NGN" },

    deliveryMethod: {
      type: String,
      enum: ["pickup", "delivery"],
      default: "pickup",
    },
    deliveryNote: { type: String, trim: true },

    // ---- Paystack ----
    paymentReference: {
      type: String,
      unique: true,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "verified", "failed", "refunded"],
      default: "pending",
      index: true,
    },

    orderStatus: {
      type: String,
      enum: [
        "pending_payment",
        "processing",
        "ready_for_pickup",
        "out_for_delivery",
        "delivered",
        "buyer_confirmed",
        "payout_pending",
        "seller_paid",
        "completed",
        "cancelled",
        "disputed",
        "refunded",
      ],
      default: "pending_payment",
      index: true,
    },

    deliveryStatus: {
      type: String,
      enum: ["pickup", "pending", "ready_for_pickup", "out_for_delivery", "delivered"],
      default: "pending",
      index: true,
    },

    payoutStatus: {
      type: String,
      enum: ["none", "pending", "processed", "paid", "paused", "failed", "cancelled"],
      default: "none",
      index: true,
    },

    buyerConfirmed: { type: Boolean, default: false },
    buyerConfirmedAt: { type: Date },

    // True once the admin has been notified about this new purchase so they can
    // help the buyer/seller coordinate handover (email + surfaced in admin UI).
    adminNotified: { type: Boolean, default: false },
    adminNotifiedAt: { type: Date },

    refundReference: { type: String, sparse: true },

    // ---- Simple dispute block ----
    dispute: {
      reason: { type: String, trim: true },
      details: { type: String, trim: true },
      status: { type: String, enum: ["none", "open", "resolved"], default: "none" },
      resolution: { type: String, enum: ["none", "refund", "release"], default: "none" },
      openedAt: { type: Date },
      resolvedAt: { type: Date },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
  },
  { timestamps: true }
);

marketplaceOrderSchema.index({ buyerId: 1, createdAt: -1 });
marketplaceOrderSchema.index({ sellerId: 1, createdAt: -1 });
marketplaceOrderSchema.index({ paymentStatus: 1, orderStatus: 1 });

marketplaceOrderSchema.set("toJSON", { virtuals: true });
marketplaceOrderSchema.set("toObject", { virtuals: true });

module.exports =
  mongoose.models.MarketplaceOrder ||
  mongoose.model("MarketplaceOrder", marketplaceOrderSchema);