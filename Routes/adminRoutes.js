const express = require("express");
const { sendBulkEmail } = require("../Controller/adminController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Send Bulk Email (Protected by auth)
router.post("/bulk-email", authMiddleware, sendBulkEmail);

module.exports = router;
