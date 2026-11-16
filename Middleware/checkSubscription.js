const Subscription = require("../Models/Subscription");

// Requires authMiddleware first. Subscription access is always derived from
// the authenticated user on the server, never from a client-supplied id.
const checkSubscriptionActive = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const subscription = await Subscription.findOne({
      userId: req.user.id,
      paymentStatus: "successful",
      expiresAt: { $gte: new Date() },
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "An active subscription is required.",
        code: "SUBSCRIPTION_REQUIRED",
      });
    }

    req.subscription = subscription;
    return next();
  } catch (err) {
    console.error("Subscription check error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to verify subscription." });
  }
};

module.exports = { checkSubscriptionActive };
