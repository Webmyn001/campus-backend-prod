const express = require("express");
const {
  getReportById,
  createReport,
  getAllReports,
  deleteReport,
} = require("../Controller/reportController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "report-submit",
  message: "Too many reports submitted. Please try again later.",
});

// Create a new scam report (public)
router.post("/", submitLimiter, createReport);

// Admin-only inbox (contains contact details)
router.get("/", authMiddleware, adminMiddleware, getAllReports);
router.get("/:id", authMiddleware, adminMiddleware, getReportById);
router.delete("/:id", authMiddleware, adminMiddleware, deleteReport);

module.exports = router;
