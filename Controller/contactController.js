const Contact = require("../Models/Contact");
const { sanitizeText, normalizeEmail, isObjectId } = require("../utils/security");

// Create a new contact request
exports.createContact = async (req, res) => {
  const name = sanitizeText(req.body.name, 80);
  const email = normalizeEmail(req.body.email);
  const message = sanitizeText(req.body.message, 1000);

  if (!name || !email) {
    return res.status(400).json({ message: "A valid name and email are required." });
  }
  if (!message || message.length < 10) {
    return res.status(400).json({ message: "Message must be between 10 and 1000 characters." });
  }

  try {
    const contact = await Contact.create({ name, email, message });
    res.status(201).json({ message: "Contact request created successfully", contact });
  } catch (error) {
    console.error("Create Contact Error:", error.message);
    res.status(500).json({ message: "Failed to create contact request" });
  }
};

// Get all contact requests (admin only)
exports.getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.status(200).json(contacts);
  } catch (error) {
    console.error("Get All Contacts Error:", error.message);
    res.status(500).json({ message: "Failed to fetch contact requests" });
  }
};

// Get a single contact request by ID (admin only)
exports.getContactById = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid contact ID." });
  }

  try {
    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ message: "Contact request not found" });
    }
    res.status(200).json(contact);
  } catch (error) {
    console.error("Get Contact Error:", error.message);
    res.status(500).json({ message: "Failed to fetch contact request" });
  }
};

// Delete a contact request (admin only)
exports.deleteContact = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ message: "Invalid contact ID." });
  }

  try {
    const contact = await Contact.findByIdAndDelete(id);

    if (!contact) {
      return res.status(404).json({ message: "Contact request not found" });
    }

    res.status(200).json({ message: "Contact request deleted successfully" });
  } catch (error) {
    console.error("Delete Contact Error:", error.message);
    res.status(500).json({ message: "Failed to delete contact request" });
  }
};
