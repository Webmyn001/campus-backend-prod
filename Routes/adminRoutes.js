const express = require("express");
const { sendBulkEmail, continueBulkEmailQueue, getBulkEmailQueueStatus, getKeepAliveStatus, updatePromoStatus, sendTestReport } = require("../Controller/adminController");
const { adminLogin } = require("../Controller/authController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Admin Login Alias (for /api/admin/login)
router.post("/login", adminLogin);

// Send Bulk Email (Protected by auth)
router.post("/bulk-email", authMiddleware, sendBulkEmail);
router.post("/bulk-email/continue", authMiddleware, continueBulkEmailQueue);
router.get("/bulk-email/status", authMiddleware, getBulkEmailQueueStatus);
router.get("/keepalive-status", authMiddleware, getKeepAliveStatus);

// Update Promo Status
router.post("/promo-status", authMiddleware, updatePromoStatus);

// Send Test Report
router.post("/send-test-report", authMiddleware, sendTestReport);

module.exports = router;
