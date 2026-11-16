const express = require("express");
const {
  createContact,
  getAllContacts,
  getContactById,
  deleteContact,
} = require("../Controller/contactController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "contact-submit",
  message: "Too many messages sent. Please try again later.",
});

// Create a new contact request (public)
router.post("/", submitLimiter, createContact);

// Admin-only inbox
router.get("/", authMiddleware, adminMiddleware, getAllContacts);
router.get("/:id", authMiddleware, adminMiddleware, getContactById);
router.delete("/:id", authMiddleware, adminMiddleware, deleteContact);

module.exports = router;
