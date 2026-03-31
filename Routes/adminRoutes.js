const express = require("express");
const { sendBulkEmail, updatePromoStatus } = require("../Controller/adminController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Send Bulk Email (Protected by auth)
router.post("/bulk-email", authMiddleware, sendBulkEmail);

// Update Promo Status
router.post("/promo-status", authMiddleware, updatePromoStatus);

module.exports = router;
