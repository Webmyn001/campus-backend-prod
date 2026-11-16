const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const { isObjectId } = require("../utils/security");

// Middleware to protect routes
const authMiddleware = async (req, res, next) => {
  const header = req.header("Authorization");
  const token = header?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json({ success: false, message: "Authorization required." });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured.");
    return res.status(500).json({ success: false, message: "Server authentication is not configured." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!isObjectId(decoded.id)) {
      return res.status(401).json({ success: false, message: "Invalid or expired token." });
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid or expired token." });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

module.exports = authMiddleware;
