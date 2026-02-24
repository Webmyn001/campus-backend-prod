const User = require("../Models/User");

const adminMiddleware = async (req, res, next) => {
    try {
        // Assuming authMiddleware has already run and attached user to req
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required." });
        }

        const user = await User.findById(req.user.id);

        if (!user || user.role !== "admin") {
            return res.status(403).json({ message: "Access denied. Admin role required." });
        }

        next();
    } catch (error) {
        console.error("Admin Middleware Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = adminMiddleware;
