const express = require("express");
const {
  verifyPayment,
  getAllSubscriptions,
  getUserStatus,
  paystackWebhook,
  getPromoStatus,
  deleteSubscription,
  createManualSubscription
} = require("../Controller/paymentController");
const { checkSubscriptionActive } = require("../Middleware/checkSubscription");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const paymentVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: "payment-verify",
});
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  prefix: "paystack-webhook",
});

router.post("/verify-payment", authMiddleware, paymentVerifyLimiter, verifyPayment);
router.post("/webhook/paystack", webhookLimiter, paystackWebhook);

router.get("/premium-content", authMiddleware, checkSubscriptionActive, (req, res) => {
  const subscription = req.subscription;

  res.status(200).json({
    success: true,
    message: "Welcome to premium content!",
    plan: subscription.plan,
    expiresAt: subscription.expiresAt,
    status: "active",
  });
});

// Admin-only subscriber management
router.get("/userplans", authMiddleware, adminMiddleware, getAllSubscriptions);
router.delete("/subscribers/:id", authMiddleware, adminMiddleware, deleteSubscription);
router.post("/subscribers/manual", authMiddleware, adminMiddleware, createManualSubscription);

// Authenticated users can read their own subscription status (admins may pass ?id=)
router.get("/status", authMiddleware, getUserStatus);

// Public campaign promo flag
router.get("/promo-status", getPromoStatus);

module.exports = router;
