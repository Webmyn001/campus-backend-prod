const Contact = require("../Models/Contact");

// Create a new contact request
exports.createContact = async (req, res) => {
  const { name, email, message } = req.body;

  try {
    const contact = await Contact.create({
      name,
      email,
      message,
    });

    res.status(201).json({ message: "Contact request created successfully", contact });
  } catch (error) {
    res.status(500).json({ message: "Failed to create contact request", error });
  }
};

// Get all contact requests
exports.getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 }); // Sort by newest first
    res.status(200).json(contacts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contact requests", error });
  }
};

// Get a single contact request by ID
exports.getContactById = async (req, res) => {
  const { id } = req.params;

  try {
    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ message: "Contact request not found" });
    }
    res.status(200).json(contact);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contact request", error });
  }
};

// Delete a contact request
exports.deleteContact = async (req, res) => {
  const { id } = req.params;

  try {
    const contact = await Contact.findByIdAndDelete(id);

    if (!contact) {
      return res.status(404).json({ message: "Contact request not found" });
    }

    res.status(200).json({ message: "Contact request deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete contact request", error });
  }
};