const jwt = require("jsonwebtoken");
const User = require("../Models/User");

// Middleware to protect routes
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "No token provided, authorization denied." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) {
      return res.status(404).json({ message: "User not found." });
    }
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is invalid.", error });
  }
};

module.exports = authMiddleware;