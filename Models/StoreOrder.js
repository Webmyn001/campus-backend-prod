const mongoose = require("mongoose");

// Orders for Campus Crave Official Store products purchased directly from
// Campus Crave (e.g. the Oktober Fest). Kept fully separate from the
// community/marketplace ledger so official-store sales can never touch
// seller payout logic. The discounted (sale) price is set server-side.
const storeOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    saleFlag: {
      type: String,
      enum: ["oktober"],
      default: "oktober",
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
    // Kept separate from buyerPhone so the admin can always reach the buyer on
    // WhatsApp, even for campus pickups where no delivery phone was collected.
    buyerWhatsapp: { type: String, trim: true },
    buyerAddress: { type: String, trim: true },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    // Immutable snapshot of the product at purchase time (accounting/audit safety)
    productSnapshot: {
      name: { type: String },
      image: { type: String },
      category: { type: String },
    },

    quantity: { type: Number, default: 1, min: 1 },

    // ---- Money (all computed server-side, NEVER trusted from the frontend) ----
    originalPrice: { type: Number, default: 0, min: 0 }, // strikethrough reference price
    unitPrice: { type: Number, default: 0, min: 0 }, // the actual payable (sale) price
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    totalPaid: { type: Number, default: 0, min: 0 }, // unitPrice * quantity
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
        "completed",
        "cancelled",
        "refunded",
      ],
      default: "pending_payment",
      index: true,
    },

    deliveryStatus: {
      type: String,
      enum: ["pending", "ready_for_pickup", "out_for_delivery", "delivered"],
      default: "pending",
      index: true,
    },

    buyerConfirmed: { type: Boolean, default: false },
    buyerConfirmedAt: { type: Date },
    deliveredAt: { type: Date },

    // Tracks each time the admin proactively notified the buyer about a stage.
    // Separate from statusHistory, which records actual state changes.
    adminNotifications: {
      type: [
        {
          _id: false,
          stage: { type: String },
          by: { type: String, trim: true },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // ---- Fulfilment tracking ----
    // Append-only audit trail. Every payment/order state change lands here so
    // the buyer can see a real progress timeline instead of guessing.
    statusHistory: {
      type: [
        {
          _id: false,
          status: { type: String },
          label: { type: String },
          note: { type: String, trim: true },
          by: { type: String, enum: ["system", "buyer", "admin"], default: "system" },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // Admin confirmation that the goods physically changed hands. Tracked
    // separately from orderStatus so the buyer sees "handed over" even when
    // the admin never pressed the Delivered button.
    goodsGiven: { type: Boolean, default: false },
    goodsGivenAt: { type: Date },
    goodsGivenBy: { type: String, trim: true },

    adminNotified: { type: Boolean, default: false },
    adminNotifiedAt: { type: Date },
  },
  { timestamps: true }
);

storeOrderSchema.index({ buyerId: 1, createdAt: -1 });
storeOrderSchema.index({ paymentStatus: 1, orderStatus: 1 });

module.exports =
  mongoose.models.StoreOrder || mongoose.model("StoreOrder", storeOrderSchema);