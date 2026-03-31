const express = require("express");
const { trackEvent, getUserStats, getGlobalStats } = require("../Controller/analyticsController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Track a view or a whatsapp click (Publicly accessible but rate-limited usually)
router.post("/track", trackEvent);

// Get my personal store stats (Protected)
router.get("/mine", authMiddleware, getUserStats);

// Get global stats (Admin only suggested but using general auth for now)
router.get("/admin", authMiddleware, getGlobalStats);

module.exports = router;
