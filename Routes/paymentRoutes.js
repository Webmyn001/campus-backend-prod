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

const router = express.Router();

router.post("/verify-payment", verifyPayment);
// router.post("/webhook/flutterwave", flutterwaveWebhook);
router.post("/webhook/paystack", paystackWebhook);
router.get("/premium-content", checkSubscriptionActive, (req, res) => {
  const now = new Date();
  const subscription = req.subscription;

  res.status(200).json({
    success: true,
    message: "Welcome to premium content!",
    plan: subscription.plan,
    expiresAt: subscription.expiresAt,
    status: subscription.expiresAt >= now ? "active" : "expired",
  });
});
router.get("/userplans", getAllSubscriptions);
router.get("/status", getUserStatus);
router.get("/promo-status", getPromoStatus);

router.delete("/subscribers/:id", deleteSubscription);

router.post("/subscribers/manual", createManualSubscription);

module.exports = router;
