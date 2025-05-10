const express = require("express");
const {
  getReportById,
  createReport,
  getAllReports,
  deleteReport,
} = require("../Controller/reportController");

const router = express.Router();

// Create a new contact request
router.post("/", createReport);

// Get all contact requests
router.get("/", getAllReports);

// Get a single contact request by ID
router.get("/:id", getReportById);

// Delete a contact request by ID
router.delete("/:id", deleteReport);

module.exports = router;