const express = require("express");
const {
  createContact,
  getAllContacts,
  getContactById,
  deleteContact,
} = require("../Controller/contactController");

const router = express.Router();

// Create a new contact request
router.post("/", createContact);

// Get all contact requests
router.get("/", getAllContacts);

// Get a single contact request by ID
router.get("/:id", getContactById);

// Delete a contact request by ID
router.delete("/:id", deleteContact);

module.exports = router;