const express = require("express");
const { signup, login, getAllUsers, updateUser, getUserById} = require("../Controller/authController");


const router = express.Router();

// Signup Route
router.post("/signup", signup);

// Login Route
router.post("/login", login);

// Get User route
router.get("/users", getAllUsers );

// Route to update a user by ID
router.put("/:id", updateUser);

// New route: Get user by ID
router.get("/:id", getUserById);

module.exports = router;