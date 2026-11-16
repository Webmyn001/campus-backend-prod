const express = require("express");
const { sendBulkEmail, continueBulkEmailQueue, getBulkEmailQueueStatus, getKeepAliveStatus, updatePromoStatus, sendTestReport } = require("../Controller/adminController");
const { adminLogin } = require("../Controller/authController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "admin-login",
});

// Admin Login Alias (for /api/admin/login)
router.post("/login", adminLoginLimiter, adminLogin);

// Every other route in this router requires an authenticated admin.
router.use(authMiddleware, adminMiddleware);

// Send Bulk Email
router.post("/bulk-email", sendBulkEmail);
router.post("/bulk-email/continue", continueBulkEmailQueue);
router.get("/bulk-email/status", getBulkEmailQueueStatus);
router.get("/keepalive-status", getKeepAliveStatus);

// Update Promo Status
router.post("/promo-status", updatePromoStatus);

// Send Test Report
router.post("/send-test-report", sendTestReport);

module.exports = router;
