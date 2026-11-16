const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const { isObjectId } = require("../utils/security");

// Attaches req.user when a valid token is supplied, but never blocks the
// request. Used for public endpoints that benefit from attribution (clicks).
async function optionalAuth(req, res, next) {
  const header = req.header("Authorization");
  if (!header || !process.env.JWT_SECRET) return next();

  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!isObjectId(decoded.id)) return next();
    const user = await User.findById(decoded.id).select("_id role email username");
    if (user) req.user = user;
  } catch {
    // Invalid optional credentials are ignored.
  }

  return next();
}

module.exports = optionalAuth;
