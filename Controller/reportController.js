const Report = require("../Models/Report");

// Create a new contact request
exports.createReport = async (req, res) => {
  const { name, email, message } = req.body;

  try {
    const report = await Report.create({
      scam,
      Description,
      contactInfo,
      image,
    });

    res.status(201).json({ message: "Contact request created successfully", report});
  } catch (error) {
    res.status(500).json({ message: "Failed to create contact request", error });
  }
};

// Get all contact requests
exports.getAllReports = async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }); // Sort by newest first
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contact requests", error });
  }
};

// Get a single contact request by ID
exports.getReportById = async (req, res) => {
  const { id } = req.params;

  try {
    const report = await Report.findById(id);
    if (!contact) {
      return res.status(404).json({ message: "Contact request not found" });
    }
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contact request", error });
  }
};

// Delete a contact request
exports.deleteReport = async (req, res) => {
  const { id } = req.params;

  try {
    const report = await Report.findByIdAndDelete(id);

    if (!report) {
      return res.status(404).json({ message: "Contact request not found" });
    }

    res.status(200).json({ message: "Contact request deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete contact request", error });
  }
};