const Report = require("../Models/Report");
const { sanitizeText, isObjectId } = require("../utils/security");

// Create a new scam report
exports.createReport = async (req, res) => {
  const scamType = sanitizeText(req.body.scamType, 100);
  const description = sanitizeText(req.body.description, 2000);
  const contactInfo = sanitizeText(req.body.contactInfo, 200);

  if (!scamType || !description) {
    return res.status(400).json({ message: "Scam type and description are required." });
  }

  try {
    const report = await Report.create({
      scamType,
      description,
      ...(contactInfo ? { contactInfo } : {}),
    });

    res.status(201).json({ message: "Report created successfully", report });
  } catch (error) {
    console.error("Create Report Error:", error.message);
    res.status(500).json({ message: "Failed to create report" });
  }
};

// Get all reports (admin only)
exports.getAllReports = async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.status(200).json(reports);
  } catch (error) {
    console.error("Get All Reports Error:", error.message);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
};

// Get a single report by ID (admin only)
exports.getReportById = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid report ID." });
  }

  try {
    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    res.status(200).json(report);
  } catch (error) {
    console.error("Get Report Error:", error.message);
    res.status(500).json({ message: "Failed to fetch report" });
  }
};

// Delete a report (admin only)
exports.deleteReport = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid report ID." });
  }

  try {
    const report = await Report.findByIdAndDelete(id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    res.status(200).json({ message: "Report deleted successfully" });
  } catch (error) {
    console.error("Delete Report Error:", error.message);
    res.status(500).json({ message: "Failed to delete report" });
  }
};
