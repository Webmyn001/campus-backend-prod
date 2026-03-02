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

// Check username availability
router.get("/check-username/:username", authMiddleware, (req, res, next) => {
    const { username } = req.params;
    const User = require("../Models/User");
    User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } })
        .then(user => {
            if (user) {
                return res.status(200).json({ available: false, message: "Username is already taken" });
            }
            res.status(200).json({ available: true });
        })
        .catch(err => res.status(500).json({ message: "Error checking username" }));
});

// Delete User by ID
router.delete("/:id", authMiddleware, deleteUser);

module.exports = router;

