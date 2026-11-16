const { timingSafeEqualStrings } = require("../utils/security");

// Fails closed: if CRON_SECRET is not configured, cron endpoints are disabled.
// Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>".
function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({
      success: false,
      message: "Cron endpoints are disabled. Set CRON_SECRET to enable them.",
    });
  }

  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const provided = bearer || req.headers["x-cron-secret"] || "";

  if (!timingSafeEqualStrings(String(provided), secret)) {
    return res.status(401).json({ success: false, message: "Invalid cron authorization." });
  }

  return next();
}

module.exports = requireCronSecret;
