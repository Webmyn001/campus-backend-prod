const axios = require("axios");
const mongoose = require("mongoose");
const Subscription = require("../Models/Subscription");
const User = require("../Models/User");
const Setting = require("../Models/Setting");
const dotenv = require("dotenv");
const crypto = require("crypto");

dotenv.config();

// ==========================
// ✅ Create Manual Subscription (Admin Only)
// ==========================
const createManualSubscription = async (req, res) => {
  try {
    const { email, plan } = req.body;
    if (!email || !plan) {
      return res.status(400).json({ success: false, message: "Email and Plan are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const validityInterval = plan === "starter" ? 1 : 30;
    const now = new Date();

    const subscription = new Subscription({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      plan,
      amountPaid: 0,
      currency: "NGN",
      paymentStatus: "successful",
      paystackRef: `MANUAL_ADMIN_GIFT_${Date.now()}`,
      validityInterval,
      expiresAt: new Date(now.getTime() + validityInterval * 24 * 60 * 60 * 1000),
    });

    await subscription.save();

    res.status(201).json({
      success: true,
      message: "Manual subscription granted successfully",
      subscription,
    });
  } catch (err) {
    console.error("❌ createManualSubscription error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================
// ✅ Paystack Verify Payment
// ==========================
const verifyPayment = async (req, res) => {
  try {
    const { reference, userId, plan, userEmail, userName } = req.body;

    if (!reference || !userId || !plan) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const now = new Date();

    // Prevent duplicate subscriptions
    const existing = await Subscription.findOne({ paystackRef: reference });
    if (existing) {
      return res.json({
        success: true,
        message: "Subscription already exists or pending verification",
        subscription: existing,
      });
    }

    // Verify transaction with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    const data = response.data?.data;
    if (!data) throw new Error("Invalid Paystack response");

    console.log("🔹 Paystack Verify Response:", {
      frontendRef: reference,
      paystackRef: data.reference,
      status: data.status,
    });

    // Determine plan validity
    const validityInterval = plan === "starter" ? 1 : 30;

    // Save subscription
    const subscription = new Subscription({
      userId,
      userEmail: userEmail || data.customer.email.toLowerCase().trim(),
      userName: userName,
      plan,
      amountPaid: data.amount / 100,
      currency: data.currency,
      paymentStatus: "pending",
      paystackRef: data.reference, // must match webhook
      frontendRef: reference,      // optional
      expiresAt: new Date(now.getTime() + validityInterval * 24 * 60 * 60 * 1000),
    });

    await subscription.save();

    res.status(201).json({
      success: true,
      message: "Subscription created. Waiting for webhook confirmation.",
      subscription,
    });
  } catch (err) {
    console.error("❌ verifyPayment error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================
// ✅ Paystack Webhook
// ==========================
const paystackWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("❌ Invalid signature. Webhook rejected.");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    if (event.event !== "charge.success") {
      console.log("ℹ️ Non-success event received. Ignored:", event.event);
      return res.sendStatus(200);
    }

    const { reference, amount, currency, customer } = event.data;
    console.log(`🔔 Webhook received. Reference: ${reference}, Amount: ${amount}, Email: ${customer?.email}`);

    // Find subscription
    let sub = await Subscription.findOne({ paystackRef: reference });

    // Retry in case subscription hasn't been saved yet
    if (!sub) {
      console.log(`⏳ Subscription not found, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      sub = await Subscription.findOne({ paystackRef: reference });
    }

    if (!sub) {
      console.warn(`⚠️ Subscription still not found for reference: ${reference}`);
      return res.sendStatus(200);
    }

    console.log("📦 Found subscription in DB:", sub);

    const updated = await Subscription.findByIdAndUpdate(
      sub._id,
      {
        $set: {
          paymentStatus: "successful",
          amountPaid: amount / 100,
          currency,
          userEmail: customer.email.toLowerCase().trim(),
        },
      },
      { new: true }
    );

    console.log("✅ Subscription updated successfully:", updated);

    res.sendStatus(200);
  } catch (err) {
    console.error("🔥 Paystack webhook error:", err);
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
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: "User ID is required" });
    if (!mongoose.Types.ObjectId.isValid(String(id)))
      return res.status(400).json({ success: false, message: "Invalid User ID" });

    const now = new Date();

    const subscriptions = await Subscription.find({ userId: id }).sort({ createdAt: -1 });

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
    if (!id) return res.status(400).json({ success: false, message: "Subscription ID is required" });

    const deleted = await Subscription.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    res.json({ success: true, message: "Subscription deleted successfully" });
  } catch (err) {
    console.error("Delete Subscription Error:", err);
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
