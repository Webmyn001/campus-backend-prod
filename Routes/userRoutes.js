const express = require("express");
const {
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    getUserStore,
    getAllPublicStores,
} = require("../Controller/userController");

const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const { escapeRegex } = require("../utils/security");
const User = require("../Models/User");

const router = express.Router();

// Admin only: directory of every account
router.get("/", authMiddleware, adminMiddleware, getAllUsers);

// Get All Public Stores (Public)
router.get("/public/all-stores", getAllPublicStores);

// Get User Store (Public)
router.get("/public/store/:identifier", getUserStore);

// Get User by ID (self or admin)
router.get("/:id", authMiddleware, getUserById);

// Update User by ID (self or admin)
router.put("/:id", authMiddleware, updateUser);

// Check username availability (authenticated)
router.get("/check-username/:username", authMiddleware, async (req, res) => {
    const { username } = req.params;
    if (typeof username !== "string" || username.length < 3 || username.length > 30) {
        return res.status(400).json({ message: "Invalid username." });
    }

    try {
        const user = await User.findOne({
            username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") },
        }).select("_id");
        return res.status(200).json({
            available: !user,
            message: user ? "Username is already taken" : "Username is available",
        });
    } catch {
        return res.status(500).json({ message: "Error checking username" });
    }
});

// Delete User by ID (self or admin)
router.delete("/:id", authMiddleware, deleteUser);

module.exports = router;
