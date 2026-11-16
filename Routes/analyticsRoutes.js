const express = require("express");
const { trackEvent, getUserStats, getGlobalStats, getTrendingItems, trackVisit } = require("../Controller/analyticsController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const visitLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, prefix: "analytics-visit" });
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, prefix: "analytics-track" });

// Track a unique site visit
router.post("/visit", visitLimiter, trackVisit);

// Track a view or a whatsapp click
router.post("/track", trackLimiter, trackEvent);

// Get trending items (Public)
router.get("/trending", getTrendingItems);

// Get my personal store stats (Protected)
router.get("/mine", authMiddleware, getUserStats);

// Get global stats (Admin only)
router.get("/admin", authMiddleware, adminMiddleware, getGlobalStats);

module.exports = router;
