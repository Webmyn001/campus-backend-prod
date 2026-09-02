const mongoose = require("mongoose");
const Listing = require("../Models/Listing1");
const User = require("../Models/User");
const Campaign = require("../Models/Campaign");
const Institution = require("../Models/Institution");
const Subscription = require("../Models/Subscription");
const MarketplaceOrder = require("../Models/MarketplaceOrder");
const MarketplacePayout = require("../Models/MarketplacePayout");
const cloudinary = require("../config/cloudinary");
const sendEmail = require("../utils/sendEmail");
const paystack = require("../utils/paystack");
const mkt = require("../utils/marketplace");

require("dotenv").config();

const PLATFORM_SUPPORT_EMAIL = process.env.PLATFORM_SUPPORT_EMAIL || "campuscrave0001@gmail.com";

function parsePage(q) {
  return { page: Math.max(1, parseInt(q.page, 10) || 1), limit: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 30)) };
}

async function notify(to, subject, html) {
  if (!to) return;
  try {
    await sendEmail(to, subject, html);
  } catch (err) {
    console.error("❌ Admin marketplace email error:", err.message);
  }
}

function sellerIdOf(listing) {
  const info = listing.sellerInfo || {};
  return info.id || info._id || listing.sellerId || info;
}

// Attach the seller's saved payout/bank details to an order for the admin to pay them.
// The full account number is exposed because the admin must transfer funds to the seller.
async function attachSellerPayout(order) {
  if (!order || !order.sellerId || order.sellerPayout) return order;
  try {
    const seller = await User.findById(order.sellerId).select("email name payoutRecipient").catch(() => null);
    if (seller && seller.payoutRecipient) {
      const p = seller.payoutRecipient;
      order = order.toObject ? order.toObject() : order;
      order.sellerEmail = seller.email || "";
      order.sellerPayout = {
        bankName: p.bankName || "",
        accountNumber: p.accountNumber || "",
        accountName: p.accountName || "",
        hasRecipient: !!(p.recipientCode && p.accountName),
      };
    }
  } catch (err) {
    console.error("❌ attachSellerPayout error:", err.message);
  }
  return order;
}

// ============================================================
// Listings management
// ============================================================
exports.getAllListings = async (req, res) => {
  try {
    const { status, approval, page: pg, limit: lm } = req.query;
    const { page, limit } = parsePage({ page: pg, limit: lm });
    const query = { saleType: "final_year" };
    if (approval) query.status = approval; // pending | approved | rejected
    if (status) query.listingState = status; // active | reserved | sold | archived | suspended

    const [listings, total] = await Promise.all([
      Listing.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Listing.countDocuments(query),
    ]);
    res.status(200).json({ success: true, listings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("❌ admin getAllListings error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.approveListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "approved", approvalNote: "" } },
      { new: true }
    );
    notify(
      listing.sellerInfo && listing.sellerInfo.email,
      "Your item is live!",
      `<p>Hello ${(listing.sellerInfo && listing.sellerInfo.name) || "there"},</p>
       <p>Your item <strong>${listing.title}</strong> has been approved and is now live on the OAU Final-Year Quick Sale.</p>
       <p>Best regards,<br/>CampusCrave Team</p>`
    );
    res.status(200).json({ success: true, listing: updated });
  } catch (err) {
    console.error("❌ approveListing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.rejectListing = async (req, res) => {
  try {
    const { note } = req.body;
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "rejected", listingState: "archived", approvalNote: (note || "").slice(0, 500) } },
      { new: true }
    );
    notify(
      listing.sellerInfo && listing.sellerInfo.email,
      "Your listing needs attention",
      `<p>Hello ${(listing.sellerInfo && listing.sellerInfo.name) || "there"},</p>
       <p>Your item <strong>${listing.title}</strong> was not approved.</p>
       ${note ? `<p>Reason: ${note}</p>` : ""}
       <p>You can edit and resubmit it from your dashboard.</p>
       <p>Best regards,<br/>CampusCrave Team</p>`
    );
    res.status(200).json({ success: true, listing: updated });
  } catch (err) {
    console.error("❌ rejectListing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.requestChanges = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ success: false, message: "A change note is required" });
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "rejected", listingState: "archived", approvalNote: note.slice(0, 500) } },
      { new: true }
    );
    notify(
      listing.sellerInfo && listing.sellerInfo.email,
      "Changes requested on your listing",
      `<p>Hello ${(listing.sellerInfo && listing.sellerInfo.name) || "there"},</p>
       <p>Our team requested changes on <strong>${listing.title}</strong> before it can go live.</p>
       <p>Note: ${note}</p>
       <p>Please edit your listing and resubmit.</p>
       <p>Best regards,<br/>CampusCrave Team</p>`
    );
    res.status(200).json({ success: true, listing: updated });
  } catch (err) {
    console.error("❌ requestChanges error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.editListing = async (req, res) => {
  try {
    const allowed = [
      "title", "category", "condition", "description", "priceAmount", "pickupLocation",
      "deliveryAvailable", "deliveryFee", "deliveryArrangement",
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.priceAmount !== undefined) {
      const num = Number(patch.priceAmount);
      if (!isFinite(num) || num <= 0) {
        return res.status(400).json({ success: false, message: "Invalid price" });
      }
      patch.priceAmount = num;
      patch.price = String(num); // keep display field in sync
    }
    if (patch.deliveryFee !== undefined) patch.deliveryFee = Number(patch.deliveryFee) || 0;

    const updated = await Listing.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: "Listing not found" });
    res.status(200).json({ success: true, listing: updated });
  } catch (err) {
    console.error("❌ editListing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.suspendListing = async (req, res) => {
  try {
    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: { listingState: "suspended" } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Listing not found" });
    res.status(200).json({ success: true, listing: updated });
  } catch (err) {
    console.error("❌ suspendListing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.activateListing = async (req, res) => {
  try {
    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: { listingState: "active" } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Listing not found" });
    res.status(200).json({ success: true, listing: updated });
  } catch (err) {
    console.error("❌ activateListing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.markSoldListing = async (req, res) => {
  try {
    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: { listingState: "sold", soldOut: true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Listing not found" });
    res.status(200).json({ success: true, listing: updated });
  } catch (err) {
    console.error("❌ markSoldListing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.removeListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });

    // Admin chooses how to handle the listing:
    //   mode = "delete"  -> permanently remove the listing (any related orders stay
    //                       in the DB for audit/escrow; the item is simply gone from
    //                       the marketplace so it can never be paid for again).
    //   mode = "archive" -> hide it from the marketplace but keep the record.
    const mode = req.body?.action === "delete" || req.query?.mode === "delete" ? "delete" : "archive";

    if (mode === "delete") {
      // Hard delete. Sold/purchased items were already marked sold and are blocked
      // from repurchase anyway, so deleting permanently is safe for preventing re-payment.
      if (listing.images && listing.images.length) {
        await Promise.all(listing.images.map((img) => cloudinary.uploader.destroy(img.public_id).catch(() => null)));
      }
      await MarketplaceOrder.updateMany({ listingId: listing._id }, { $set: { listingSnapshot: listing.listingSnapshot || {} } }).catch(() => null);
      await Listing.findByIdAndDelete(req.params.id);
      return res.status(200).json({ success: true, message: "Listing deleted", deleted: true });
    }

    // archive mode: hide from the marketplace, keep ordering/escrow records intact.
    const archived = await Listing.findByIdAndUpdate(req.params.id, { $set: { listingState: "archived", status: "rejected" } }, { new: true });
    res.status(200).json({ success: true, message: "Listing archived & hidden from the marketplace", archived: true, listing: archived });
  } catch (err) {
    console.error("❌ removeListing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Report whether deleting this listing will permanently delete it (no order history)
// or only archive it (has order history). Used by the admin UI to show the right
// confirmation before making the change.
exports.getListingAction = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    const hasOrders = await MarketplaceOrder.exists({ listingId: listing._id });
    res.status(200).json({ success: true, hasOrders: !!hasOrders });
  } catch (err) {
    console.error("❌ getListingAction error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Orders management
// ============================================================
exports.getAllOrders = async (req, res) => {
  try {
    const { status, page: pg, limit: lm } = req.query;
    const { page, limit } = parsePage({ page: pg, limit: lm });
    const query = {};
    if (status) query.orderStatus = status;

    const [orders, total] = await Promise.all([
      MarketplaceOrder.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      MarketplaceOrder.countDocuments(query),
    ]);
    const enriched = [];
    for (const o of orders) enriched.push(await attachSellerPayout(o));
    res.status(200).json({ success: true, orders: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("❌ admin getAllOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await MarketplaceOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const payout = await MarketplacePayout.findOne({ orderId: order._id }).catch(() => null);
    const enriched = await attachSellerPayout(order);
    res.status(200).json({ success: true, order: enriched, payout });
  } catch (err) {
    console.error("❌ admin getOrderById error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Resolve a dispute: refund the buyer OR release the seller payout
exports.resolveDispute = async (req, res) => {
  const { id } = req.params;
  const { resolution, note } = req.body; // "refund" | "release"
  try {
    if (!["refund", "release"].includes(resolution)) {
      return res.status(400).json({ success: false, message: "Resolution must be refund or release" });
    }
    const order = await MarketplaceOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!(order.dispute && order.dispute.status === "open")) {
      return res.status(400).json({ success: false, message: "This order has no open dispute" });
    }

    if (resolution === "refund") {
      // Refund the buyer via Paystack (idempotent: skip if already refunded)
      if (order.paymentStatus !== "refunded") {
        const refund = await paystack.initiateRefund({ reference: order.paymentReference }).catch((err) => {
          console.error("❌ Paystack refund error:", err.message);
          return null;
        });
        await MarketplaceOrder.findByIdAndUpdate(id, {
          $set: {
            paymentStatus: "refunded",
            orderStatus: "refunded",
            payoutStatus: "cancelled",
            refundReference: refund ? order.paymentReference : "",
            "dispute.status": "resolved",
            "dispute.resolution": "refund",
            "dispute.resolvedAt": new Date(),
            "dispute.resolvedBy": req.user._id,
          },
        });
        await MarketplacePayout.updateMany({ orderId: order._id }, { $set: { status: "cancelled" } });
        // Relist the item so the buyer can try again / it isn't stuck
        await Listing.findByIdAndUpdate(order.listingId, { $set: { listingState: "active", soldOut: false } });
      }
      notify(
        order.buyerEmail,
        "Your refund has been processed",
        `<p>Hello ${order.buyerName || "there"},</p><p>Your dispute for order <strong>${order.orderNumber}</strong> was resolved with a refund. Money returns to your payment method.</p><p>Best regards,<br/>CampusCrave Team</p>`
      );
      return res.status(200).json({ success: true, message: "Buyer refunded", orderStatus: "refunded" });
    }

    // release -> favour seller
    await MarketplaceOrder.findByIdAndUpdate(id, {
      $set: {
        orderStatus: "buyer_confirmed",
        payoutStatus: "pending",
        "dispute.status": "resolved",
        "dispute.resolution": "release",
        "dispute.resolvedAt": new Date(),
        "dispute.resolvedBy": req.user._id,
      },
    });
    await MarketplacePayout.updateMany(
      { orderId: order._id, status: "paused" },
      { $set: { status: "pending" } }
    );
    notify(
      order.sellerName ? (await User.findById(order.sellerId).catch(() => null))?.email : null,
      "Your dispute was resolved in your favour",
      `<p>Hello,</p><p>The dispute on order <strong>${order.orderNumber}</strong> was reviewed and resolved in your favour. Your payout is now being processed.</p><p>Best regards,<br/>CampusCrave Team</p>`
    );
    res.status(200).json({ success: true, message: "Admin note recorded (note: " + (note || "") + ")" });
  } catch (err) {
    console.error("❌ resolveDispute error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Payout management
// ============================================================
exports.getAllPayouts = async (req, res) => {
  try {
    const { status, page: pg, limit: lm } = req.query;
    const { page, limit } = parsePage({ page: pg, limit: lm });
    const query = {};
    if (status) query.status = status;

    const [payouts, total] = await Promise.all([
      MarketplacePayout.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      MarketplacePayout.countDocuments(query),
    ]);

    // Enrich each payout with seller bank details + order numbers so the admin can
    // pay the seller manually (Option A — no automatic Paystack transfer).
    const enriched = [];
    for (const p of payouts) {
      const item = p.toObject ? p.toObject() : p;
      const seller = await User.findById(p.sellerId).select("name email payoutRecipient").catch(() => null);
      const order = await MarketplaceOrder.findById(p.orderId).select("orderNumber sellerAmount platformFee totalPaid deliveryFee priceAmount").catch(() => null);
      if (seller) {
        item.sellerName = seller.name || "";
        item.sellerEmail = seller.email || "";
      }
      if (seller && seller.payoutRecipient) {
        const r = seller.payoutRecipient;
        item.sellerPayout = {
          bankName: r.bankName || "",
          accountName: r.accountName || "",
          accountNumber: r.accountNumber || "",
          recipientCode: r.recipientCode || "",
          hasRecipient: !!(r.recipientCode && r.accountName),
        };
      } else {
        item.sellerPayout = { hasRecipient: false };
      }
      item.orderNumber = (order && order.orderNumber) || "";
      item.sellerAmount = (order && order.sellerAmount) ?? p.amount;
      item.platformFee = (order && order.platformFee) ?? p.platformFee ?? 0;
      item.totalPaid = (order && order.totalPaid) ?? 0;
      item.deliveryFee = (order && order.deliveryFee) ?? 0;
      item.priceAmount = (order && order.priceAmount) ?? 0;
      enriched.push(item);
    }

    res.status(200).json({ success: true, payouts: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("❌ admin getAllPayouts error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Process a (pending) payout. Option A: we do NOT auto-transfer via Paystack.
// The admin receives the escrow money in their Paystack/bank account, then pays
// the seller manually using the seller's saved bank details. This endpoint merely
// marks the payout as ready-to-release and returns the exact amounts + bank details.
exports.processPayout = async (req, res) => {
  try {
    const payout = await MarketplacePayout.findById(req.params.id);
    if (!payout) return res.status(404).json({ success: false, message: "Payout not found" });

    if (!["pending", "paused", "failed"].includes(payout.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot process payout in state "${payout.status}". A duplicate attempt is blocked.`,
      });
    }

    const order = await MarketplaceOrder.findById(payout.orderId);
    if (!order || order.paymentStatus === "refunded" || order.orderStatus === "refunded") {
      return res.status(400).json({ success: false, message: "Order was refunded; payout cannot be processed" });
    }
    if (order.payoutStatus === "paused" && order.dispute && order.dispute.status === "open") {
      return res.status(400).json({ success: false, message: "Order has an open dispute; resolve it first" });
    }

    const seller = await User.findById(payout.sellerId);
    if (!seller || !seller.payoutRecipient || !seller.payoutRecipient.recipientCode) {
      return res.status(400).json({ success: false, message: "Seller has not added payout bank details" });
    }

    const amount = order.sellerAmount ?? payout.amount;
    if (!(amount > 0)) {
      return res.status(400).json({ success: false, message: "Payout amount is zero" });
    }

    // No Paystack call — the admin pays the seller manually. Just mark it released/awaiting payment confirmation.
    const updatedPayout = await MarketplacePayout.findByIdAndUpdate(
      payout._id,
      {
        $set: {
          status: "processed",
          initiatedAt: new Date(),
          processedBy: req.user._id,
          failureReason: "",
        },
      },
      { new: true }
    );
    await MarketplaceOrder.findByIdAndUpdate(order._id, {
      $set: { payoutStatus: "processed", orderStatus: "payout_pending" },
    });

    const r = seller.payoutRecipient;
    res.status(200).json({
      success: true,
      message: "Payout released. Pay the seller manually using these details.",
      payout: updatedPayout,
      instructions: {
        orderNumber: order.orderNumber,
        paySeller: amount,
        platformFee: order.platformFee ?? payout.platformFee ?? 0,
        sellerBank: { bankName: r.bankName || "", accountNumber: r.accountNumber || "", accountName: r.accountName || "" },
      },
    });
  } catch (err) {
    console.error("❌ processPayout error:", err.message);
    res.status(400).json({ success: false, message: err.message || "Server error" });
  }
};

// Manual fallback when Paystack auto-payout webhooks are disabled
exports.markPayoutPaid = async (req, res) => {
  try {
    const payout = await MarketplacePayout.findById(req.params.id);
    if (!payout) return res.status(404).json({ success: false, message: "Payout not found" });
    if (payout.status === "paid") {
      return res.status(200).json({ success: true, message: "Already marked paid", payout });
    }
    const updated = await MarketplacePayout.findByIdAndUpdate(req.params.id, {
      $set: { status: "paid", paidAt: new Date(), processedBy: req.user._id },
    }, { new: true });
    await MarketplaceOrder.findByIdAndUpdate(payout.orderId, {
      $set: { payoutStatus: "paid", orderStatus: "seller_paid" },
    });
    const order = await MarketplaceOrder.findById(payout.orderId);
    if (order) {
      await Listing.findByIdAndUpdate(order.listingId, { $set: { listingState: "sold", soldOut: true } });
    }
    res.status(200).json({ success: true, payout: updated });
  } catch (err) {
    console.error("❌ markPayoutPaid error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Completion helper used by payouts after payout finalised
exports.completeOrder = async (req, res) => {
  try {
    const order = await MarketplaceOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.payoutStatus !== "paid") {
      return res.status(400).json({ success: false, message: "Seller must be paid before completion" });
    }
    const updated = await MarketplaceOrder.findByIdAndUpdate(order._id, {
      $set: { orderStatus: "completed" },
    }, { new: true });
    await Listing.findByIdAndUpdate(order.listingId, { $set: { listingState: "sold", soldOut: true } });
    res.status(200).json({ success: true, order: updated });
  } catch (err) {
    console.error("❌ completeOrder error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Financials (subscription and marketplace kept separate)
// ============================================================
exports.getFinancials = async (_req, res) => {
  try {
    const [subAgg, grossAgg, payoutAgg, pendingAgg, refundAgg] = await Promise.all([
      Subscription.aggregate([
        { $match: { paymentStatus: "successful" } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),
      MarketplaceOrder.aggregate([
        { $match: { paymentStatus: { $in: ["verified", "paid"] } } },
        {
          $group: {
            _id: null,
            gross: { $sum: "$totalPaid" },
            commission: { $sum: "$platformFee" },
            sellerTotal: { $sum: "$sellerAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      MarketplacePayout.aggregate([
        { $match: { status: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      MarketplacePayout.aggregate([
        { $match: { status: { $in: ["pending", "initiated", "processed", "paused"] } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      MarketplaceOrder.aggregate([
        { $match: { paymentStatus: "refunded" } },
        { $group: { _id: null, total: { $sum: "$totalPaid" }, count: { $sum: 1 } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      financials: {
        subscriptionRevenue: subAgg[0]?.total || 0,
        marketplaceGrossSales: grossAgg[0]?.gross || 0,
        marketplaceOrderCount: grossAgg[0]?.count || 0,
        marketplaceCommission: grossAgg[0]?.commission || 0,
        marketplaceSellerTotal: grossAgg[0]?.sellerTotal || 0,
        sellerPayoutsPaid: payoutAgg[0]?.total || 0,
        sellerPayoutsPaidCount: payoutAgg[0]?.count || 0,
        pendingPayouts: pendingAgg[0]?.total || 0,
        pendingPayoutsCount: pendingAgg[0]?.count || 0,
        refunds: refundAgg[0]?.total || 0,
        refundsCount: refundAgg[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error("❌ getFinancials error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Campaigns + institutions (configurable, not hard-coded)
// ============================================================
exports.getAllCampaigns = async (_req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, campaigns: campaigns.map((c) => ({ ...c.toObject(), status: c.effectiveStatus() })) });
  } catch (err) {
    console.error("❌ getAllCampaigns error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const { name, institutionId, institutionCode, institutionName, saleType, tagline, description, startDate, endDate, status } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Name, start and end dates are required" });
    }
    const campaign = await Campaign.create({
      name,
      institutionId: institutionId || undefined,
      institutionCode: institutionCode || "",
      institutionName: institutionName || "",
      saleType: saleType || "final_year",
      tagline: tagline || "",
      description: description || "",
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: status || "active",
    });
    res.status(201).json({ success: true, campaign: { ...campaign.toObject(), status: campaign.effectiveStatus() } });
  } catch (err) {
    console.error("❌ createCampaign error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["name", "institutionId", "institutionCode", "institutionName", "saleType", "tagline", "description", "startDate", "endDate", "status"];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        patch[key] = key === "startDate" || key === "endDate" ? new Date(req.body[key]) : req.body[key];
      }
    }
    const campaign = await Campaign.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    res.status(200).json({ success: true, campaign: { ...campaign.toObject(), status: campaign.effectiveStatus() } });
  } catch (err) {
    console.error("❌ updateCampaign error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const related = await Listing.countDocuments({ campaignId: id });
    if (related > 0) {
      // Campaign may have listings; soft-disable instead of deleting history
      await Campaign.findByIdAndUpdate(id, { $set: { status: "ended" } });
      return res.status(200).json({ success: true, message: "Campaign has listings; ended instead of deleted", ended: true });
    }
    await Campaign.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    console.error("❌ deleteCampaign error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getAllInstitutions = async (_req, res) => {
  try {
    const institutions = await Institution.find().sort({ name: 1 });
    res.status(200).json({ success: true, institutions });
  } catch (err) {
    console.error("❌ getAllInstitutions error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createInstitution = async (req, res) => {
  try {
    const { name, code, location } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, message: "Name and code are required" });
    const institution = await Institution.create({ name, code: code.toUpperCase(), location: location || "" });
    res.status(201).json({ success: true, institution });
  } catch (err) {
    console.error("❌ createInstitution error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};