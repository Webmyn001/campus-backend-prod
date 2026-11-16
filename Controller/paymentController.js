const axios = require("axios");
const mongoose = require("mongoose");
const Subscription = require("../Models/Subscription");
const User = require("../Models/User");
const Setting = require("../Models/Setting");
const dotenv = require("dotenv");
const crypto = require("crypto");
const { handleMarketplaceWebhook } = require("./marketplaceController");
const { handleStoreSaleWebhook } = require("./oktoberFestController");
const { getPlan, getPlanPriceKobo, expiryFromNow } = require("../utils/plans");
const { normalizeEmail, isObjectId, timingSafeEqualStrings } = require("../utils/security");

dotenv.config();

// ==========================
// ✅ Create Manual Subscription (Admin Only)
// ==========================
const createManualSubscription = async (req, res) => {
  try {
    const { email, plan: planInput } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const plan = getPlan(planInput);

    if (!normalizedEmail || !plan) {
      return res.status(400).json({ success: false, message: "A valid user email and plan are required." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const now = new Date();
    const subscription = new Subscription({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      plan: plan.name,
      amountPaid: 0,
      currency: "NGN",
      paymentStatus: "successful",
      paystackRef: `MANUAL_ADMIN_GIFT_${Date.now()}`,
      validityInterval: plan.validityDays,
      expiresAt: expiryFromNow(plan.name, now),
    });

    await subscription.save();

    res.status(201).json({
      success: true,
      message: "Manual subscription granted successfully",
      subscription,
    });
  } catch (err) {
    console.error("createManualSubscription error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================
// ✅ Paystack Verify Payment
// ==========================
const verifyPayment = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
    const plan = getPlan(req.body?.plan);

    if (!reference || reference.length > 100) {
      return res.status(400).json({ success: false, message: "A valid payment reference is required." });
    }
    if (!plan) {
      return res.status(400).json({ success: false, message: "Unknown subscription plan." });
    }
    if (!plan.purchasable) {
      return res.status(400).json({ success: false, message: "This plan does not require a payment." });
    }

    const expectedKobo = getPlanPriceKobo(plan.name);
    if (!expectedKobo) {
      return res.status(503).json({ success: false, message: "Subscription pricing is not configured." });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(503).json({ success: false, message: "Payment verification is not configured." });
    }

    let data;
    try {
      const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
          timeout: 15000,
        }
      );
      data = response.data?.data;
    } catch (err) {
      console.error("Paystack verify request failed:", err.response?.data?.message || err.message);
      return res.status(502).json({ success: false, message: "Unable to verify payment with Paystack." });
    }

    if (!data) {
      return res.status(502).json({ success: false, message: "Invalid Paystack response." });
    }
    if (data.status !== "success") {
      return res.status(400).json({ success: false, message: "Payment has not been confirmed." });
    }
    if (data.currency !== "NGN") {
      return res.status(400).json({ success: false, message: "Payment currency does not match this plan." });
    }
    if (Number(data.amount) !== expectedKobo) {
      return res.status(400).json({ success: false, message: "Payment amount does not match the selected plan." });
    }

    // The payer must be the authenticated account.
    const payerEmail = normalizeEmail(data.customer?.email);
    const accountEmail = normalizeEmail(user.email);
    if (!payerEmail || !accountEmail || payerEmail !== accountEmail) {
      return res.status(403).json({ success: false, message: "This payment does not belong to your account." });
    }

    // If Paystack metadata was supplied at checkout, it must agree with the
    // authenticated user and selected plan.
    const metadata = data.metadata || {};
    if (metadata.userId && String(metadata.userId) !== String(user._id)) {
      return res.status(403).json({ success: false, message: "This payment does not belong to your account." });
    }
    if (metadata.plan && String(metadata.plan) !== plan.name) {
      return res.status(400).json({ success: false, message: "Payment plan does not match the selected plan." });
    }

    const paystackRef = data.reference;
    const existing = await Subscription.findOne({
      $or: [{ paystackRef }, { frontendRef: reference }],
    });

    if (existing) {
      if (String(existing.userId) !== String(user._id)) {
        return res.status(409).json({ success: false, message: "This payment reference has already been used." });
      }

      if (existing.paymentStatus !== "successful") {
        const updated = await Subscription.findByIdAndUpdate(
          existing._id,
          {
            $set: {
              paymentStatus: "successful",
              amountPaid: Number(data.amount) / 100,
              currency: data.currency,
              plan: plan.name,
              validityInterval: plan.validityDays,
              expiresAt: expiryFromNow(plan.name),
            },
          },
          { new: true }
        );
        return res.json({
          success: true,
          message: "Payment verified! Your plan is now active.",
          subscription: updated,
        });
      }

      return res.json({
        success: true,
        message: "Payment verified! Your plan is now active.",
        subscription: existing,
      });
    }

    const subscription = new Subscription({
      userId: user._id,
      userEmail: accountEmail,
      userName: user.name,
      plan: plan.name,
      amountPaid: Number(data.amount) / 100,
      currency: data.currency,
      paymentStatus: "successful",
      paystackRef,
      frontendRef: reference,
      validityInterval: plan.validityDays,
      expiresAt: expiryFromNow(plan.name),
    });

    await subscription.save();

    console.log(`Subscription activated for user ${user._id} on plan ${plan.name}`);

    res.status(201).json({
      success: true,
      message: "Payment verified! Your plan is now active.",
      subscription,
    });
  } catch (err) {
    console.error("verifyPayment error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================
// ✅ Paystack Webhook
// ==========================
const paystackWebhook = async (req, res) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error("PAYSTACK_SECRET_KEY is not configured; webhook rejected.");
      return res.sendStatus(503);
    }

    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}));
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (!timingSafeEqualStrings(hash, String(req.headers["x-paystack-signature"] || ""))) {
      console.error("Invalid Paystack webhook signature. Rejected.");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;
    const eventType = event.event;

    // ==========================
    // 🛒 MARKETPLACE events are handled in a completely separate module so they
    // can never touch subscription business logic. This covers:
    //   - charge.success  with metadata.type === "marketplace_purchase"
    //   - transfer.success / transfer.failed  (seller payouts)
    // ==========================
    const isMarketplaceEvent =
      (eventType === "charge.success" && event.data?.metadata?.type === "marketplace_purchase") ||
      eventType === "transfer.success" ||
      eventType === "transfer.failed";

    if (isMarketplaceEvent) {
      console.log(`🛒 Marketplace webhook event "${eventType}". Ref: ${event.data?.reference || event.data?.transfer_code || "n/a"}`);
      try {
        const result = await handleMarketplaceWebhook(event);
        console.log("🛒 Marketplace webhook handled:", result);
      } catch (err) {
        console.error("🔥 Marketplace webhook handling error:", err);
      }
      return res.sendStatus(200);
    }

    // ==========================
    // 🎃 OCTOBER SALE (official store) events are handled in their own module
    // ==========================
    if (eventType === "charge.success" && event.data?.metadata?.type === "oktober_fest_purchase") {
      console.log(`🎃 Oktober Fest webhook event. Ref: ${event.data?.reference || "n/a"}`);
      try {
        const result = await handleStoreSaleWebhook(event);
        console.log("🎃 Oktober Fest webhook handled:", result);
      } catch (err) {
        console.error("🔥 Oktober Fest webhook handling error:", err);
      }
      return res.sendStatus(200);
    }

    if (eventType !== "charge.success") {
      console.log("ℹ️ Non-success event received. Ignored:", eventType);
      return res.sendStatus(200);
    }

    // ==========================
    // ✅ SUBSCRIPTION events
    // ==========================
    const { reference, amount, currency, customer, metadata } = event.data || {};
    console.log(`Webhook subscription event. Ref: ${reference}, Amount: ${amount}`);

    if (!reference || typeof reference !== "string") {
      return res.sendStatus(200);
    }

    const metaPlan = metadata?.plan;
    const metaUserId = metadata?.userId;

    let sub = await Subscription.findOne({ paystackRef: reference });

    if (sub && metaUserId && String(metaUserId) !== String(sub.userId)) {
      console.warn("Webhook metadata userId does not match subscription owner. Ignored.");
      return res.sendStatus(200);
    }

    const plan = getPlan(sub ? sub.plan : metaPlan);
    if (!plan || !plan.purchasable) {
      console.warn("Webhook received without a valid subscription plan. Ignored.");
      return res.sendStatus(200);
    }

    const expectedKobo = getPlanPriceKobo(plan.name);
    if (!expectedKobo || Number(amount) !== expectedKobo || currency !== "NGN") {
      console.error(
        `Webhook amount/currency mismatch for ${plan.name}: got ${amount} ${currency}, expected ${expectedKobo} NGN. Ignored.`
      );
      return res.sendStatus(200);
    }

    if (!sub) {
      if (!metaUserId || !isObjectId(metaUserId)) {
        console.warn("Webhook missing a valid metadata userId. Cannot create subscription.");
        return res.sendStatus(200);
      }

      const user = await User.findById(metaUserId);
      if (!user) {
        console.error("Webhook user not found. Cannot create subscription.");
        return res.sendStatus(200);
      }

      const customerEmail = normalizeEmail(customer?.email);
      if (!customerEmail || customerEmail !== normalizeEmail(user.email)) {
        console.warn("Webhook customer email does not match the user. Ignored.");
        return res.sendStatus(200);
      }

      try {
        sub = new Subscription({
          userId: user._id,
          userEmail: user.email,
          userName: user.name,
          plan: plan.name,
          amountPaid: Number(amount) / 100,
          currency,
          paymentStatus: "successful",
          paystackRef: reference,
          validityInterval: plan.validityDays,
          expiresAt: expiryFromNow(plan.name),
        });
        await sub.save();
        console.log("Subscription created and activated via webhook.");
      } catch (err) {
        if (err.code === 11000) return res.sendStatus(200);
        throw err;
      }
    } else if (sub.paymentStatus !== "successful") {
      await Subscription.findByIdAndUpdate(
        sub._id,
        {
          $set: {
            paymentStatus: "successful",
            amountPaid: Number(amount) / 100,
            currency,
            validityInterval: plan.validityDays,
            expiresAt: expiryFromNow(plan.name),
          },
        },
        { new: true }
      );
      console.log("Existing subscription activated via webhook.");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Paystack webhook error:", err.message);
    res.sendStatus(500);
  }
};

// ==========================
// ✅ Get all subscriptions
// ==========================
const getAllSubscriptions = async (_req, res) => {
  try {
    const subscriptions = await Subscription.find().sort({ createdAt: -1 });
    const now = new Date();

    const dataWithStatus = subscriptions.map((sub) => ({
      ...sub.toObject(),
      status:
        sub.paymentStatus === "successful" && sub.expiresAt >= now
          ? "active"
          : sub.paymentStatus === "pending"
            ? "pending"
            : "expired",
    }));

    res.status(200).json({ success: true, data: dataWithStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================
// ✅ Get user subscription status
// ==========================
const getUserStatus = async (req, res) => {
  try {
    let userId = String(req.user.id);

    if (req.query.id !== undefined) {
      if (!isObjectId(req.query.id)) {
        return res.status(400).json({ success: false, message: "Invalid User ID" });
      }
      if (req.user.role !== "admin" && String(req.query.id) !== userId) {
        return res.status(403).json({ success: false, message: "You can only view your own subscription." });
      }
      if (req.user.role === "admin") userId = String(req.query.id);
    }

    const now = new Date();

    const subscriptions = await Subscription.find({ userId }).sort({ createdAt: -1 });

    if (!subscriptions.length) return res.json({ success: true, activePlans: [] });

    const activePlans = subscriptions.map((sub) => {
      let status;
      if (sub.paymentStatus === "pending") status = "pending";
      else if (sub.expiresAt >= now && sub.paymentStatus === "successful") status = "subscribed";
      else status = "expired";

      return {
        plan: sub.plan,
        status,
        expiresAt: sub.expiresAt,
        amountPaid: sub.amountPaid,
        currency: sub.currency,
        paymentStatus: sub.paymentStatus,
        createdAt: sub.createdAt,
      };
    });

    const latestActive = subscriptions.find(
      (sub) => sub.expiresAt >= now && sub.paymentStatus === "successful"
    );

    res.json({ success: true, activePlans, latestActive: latestActive || null });
  } catch (err) {
    console.error("Get User Status Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================
// ✅ Get global promo status
// ==========================
const getPromoStatus = async (_req, res) => {
  try {
    const setting = await Setting.findOne({ key: "isPromoActive" });
    res.json({ success: true, isPromoActive: setting ? setting.value : false });
  } catch (err) {
    console.error("Get Promo Status Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================
// ✅ Delete a subscription
// ==========================
const deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid subscription ID." });
    }

    const deleted = await Subscription.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    res.json({ success: true, message: "Subscription deleted successfully" });
  } catch (err) {
    console.error("Delete Subscription Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  verifyPayment,
  paystackWebhook,
  getAllSubscriptions,
  getUserStatus,
  getPromoStatus,
  deleteSubscription,
  createManualSubscription,
};
