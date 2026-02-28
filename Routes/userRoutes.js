const express = require("express");
const {
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    getUserStore,
} = require("../Controller/userController");

const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// Get All Users
router.get("/", authMiddleware, getAllUsers);

// Get User Store (Public)
router.get("/store/:identifier", getUserStore);

// Get User by ID
router.get("/:id", authMiddleware, getUserById);

// Update User by ID
router.put("/:id", authMiddleware, updateUser);

// Delete User by ID
router.delete("/:id", authMiddleware, deleteUser);

module.exports = router;

