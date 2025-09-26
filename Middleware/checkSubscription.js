const mongoose = require("mongoose");
const Subscription = require("../Models/Subscription");

const checkSubscriptionActive = async (req, res, next) => {
  try {
    // Accept userId from query, headers, or body
    let userId =
      req.query.id ||
      req.query.userId ||
      req.headers["x-user-id"] ||
      req.body?.userId;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId is required" });
    }

    // Convert to ObjectId if possible
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid userId format" });
    }
    userId = new mongoose.Types.ObjectId(userId);

    // Get the latest subscription for this user
    const subscription = await Subscription.findOne({ userId }).sort({
      createdAt: -1,
    });

    if (!subscription) {
      return res
        .status(404)
        .json({ success: false, message: "No subscription found" });
    }

    // Determine status
    const now = new Date();
    subscription.status = subscription.expiresAt >= now ? "active" : "expired";

    // Attach subscription to request
    req.subscription = subscription;

    next();
  } catch (err) {
    console.error("❌ Subscription check error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Export with CommonJS
module.exports = { checkSubscriptionActive };
