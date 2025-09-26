const axios = require("axios") ;
const crypto =require ("crypto");
const mongoose = require ("mongoose");
const Subscription = require ("../Models/Subscription");
const dotenv = require("dotenv");

// ✅ Verify payment manually
const verifyPayment = async (req, res) => {
  try {
    const { transaction_id, userId, plan } = req.body;

    if (!transaction_id || !userId || !plan) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Free plan (test only)
    if (transaction_id === "FREE_PLAN") {
      const subscription = new Subscription({
        userId,
        plan: "starter",
        amountPaid: 0,
        currency: "NGN",
        paymentStatus: "successful",
        flutterwaveTxId: transaction_id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await subscription.save();

      return res.status(200).json({
        success: true,
        message: "Free starter plan subscribed (24h)",
        subscription,
      });
    }

    // Verify with Flutterwave
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
      }
    );

    const data = response.data?.data;
    if (!data || data.status !== "successful") {
      return res
        .status(400)
        .json({ success: false, message: "Payment not successful" });
    }

    // Prevent duplicate txId
    const existing = await Subscription.findOne({
      flutterwaveTxId: transaction_id,
    });
    if (existing) {
      return res.json({
        success: true,
        message: "Already verified",
        subscription: existing,
      });
    }

    // Plan validity
    let validityInterval = 30;
    if (plan === "starter") validityInterval = 1;

    const subscription = new Subscription({
      userId,
      plan,
      amountPaid: data.amount,
      currency: data.currency,
      paymentStatus: "successful",
      flutterwaveTxId: transaction_id,
      expiresAt: new Date(Date.now() + validityInterval * 24 * 60 * 60 * 1000),
    });

    await subscription.save();
    res
      .status(201)
      .json({ success: true, message: "Subscription created", subscription });
  } catch (err) {
    console.error("❌ verify-payment error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Flutterwave webhook
const flutterwaveWebhook = async (req, res) => {
  try {
    const signature = req.headers["verif-hash"];
    const secret = process.env.FLW_SECRET_KEY;

    const hash = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature !== hash) {
      console.error("❌ Invalid webhook signature");
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const event = req.body;
    if (!event?.data) {
      return res.status(400).json({ success: false, message: "No data in webhook" });
    }

    if (event.data.status === "successful") {
      const userId = event.data.customer?.id;
      const txId = event.data.id;

      const existing = await Subscription.findOne({ flutterwaveTxId: txId });
      if (existing) {
        return res.status(200).json({ success: true, message: "Already processed" });
      }

      const plan = event.data.plan || "standard";
      let validityInterval = plan === "starter" ? 1 : 30;

      const subscription = new Subscription({
        userId,
        plan,
        amountPaid: event.data.amount,
        currency: event.data.currency,
        paymentStatus: "successful",
        flutterwaveTxId: txId,
        expiresAt: new Date(Date.now() + validityInterval * 24 * 60 * 60 * 1000),
      });

      await subscription.save();
      console.log("✅ Subscription created via webhook:", subscription);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Get all subscriptions
const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find().sort({ createdAt: -1 });
    const now = new Date();

    const dataWithStatus = subscriptions.map((sub) => ({
      ...sub.toObject(),
      status: sub.expiresAt >= now ? "active" : "expired",
    }));

    res.status(200).json({ success: true, data: dataWithStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Get user subscription status
const getUserStatus = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) return res.status(400).json({ success: false, message: "User ID is required" });
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid User ID" });
    }

    const subscriptions = await Subscription.find({ userId: id }).sort({ createdAt: -1 });

    if (!subscriptions.length) {
      return res.json({
        success: true,
        activePlans: [], // no subscription at all
      });
    }

    const now = new Date();
    const activePlans = subscriptions.map((sub) => {
      let status;
      if (sub.expiresAt >= now) {
        status = "subscribed";
      } else {
        status = "expired";
      }

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

    res.json({ success: true, activePlans });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};


module.exports = { getUserStatus };


module.exports = {
  verifyPayment,
  flutterwaveWebhook,
  getAllSubscriptions,
  getUserStatus,
};