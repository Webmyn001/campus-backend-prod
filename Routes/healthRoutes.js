const express = require("express");
const router = express.Router();
const Setting = require("../Models/Setting");

// Public ping endpoint. Also records last ping in Settings for admin visibility.
router.get("/ping", async (req, res) => {
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      ua: req.headers["user-agent"] || "",
    };

    await Setting.findOneAndUpdate(
      { key: "lastPing" },
      { value: payload, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    res.status(200).json({ status: "ok", payload });
  } catch (err) {
    console.error("Ping save error:", err);
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  }
});

router.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    service: "Campus-Backend",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
