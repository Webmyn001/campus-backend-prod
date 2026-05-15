const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // ✅ Used for webhook email matching
  userEmail: {
    type: String,
    trim: true,
    lowercase: true,
    index: true,
  },

  userName: {
    type: String,
    trim: true,
  },

  plan: {
    type: String,
    enum: ["starter", "standard", "premium", "premium6m"],
    required: true,
    index: true,
  },

  amountPaid: {
    type: Number,
    required: true,
    min: 0,
  },

  currency: {
    type: String,
    default: "NGN",
  },

  paymentStatus: {
    type: String,
    enum: ["pending", "successful", "failed"],
    default: "pending",
    index: true,
  },

  // 🔁 OLD (keep for historical Flutterwave records)
  flutterwaveTxId: {
    type: String,
    sparse: true,
    index: true,
  },

  // ✅ NEW (Paystack reference)
  paystackRef: {
    type: String,
    sparse: true,
    unique: true,
    index: true,
  },

  frontendRef: { type: String, unique: true, sparse: true },
  // 📆 Subscription length in days
  validityInterval: {
    type: Number,
    default: 30,
  },

  expiresAt: {
    type: Date,
    index: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// ✅ Auto-calc expiresAt if not manually set
subscriptionSchema.pre("save", function (next) {
  if (!this.expiresAt) {
    const start = this.createdAt || new Date();
    this.expiresAt = new Date(
      start.getTime() + this.validityInterval * 24 * 60 * 60 * 1000
    );
  }
  next();
});


// ✅ Export
module.exports =
  mongoose.models.Subscription ||
  mongoose.model("Subscription", subscriptionSchema, "userplans");
