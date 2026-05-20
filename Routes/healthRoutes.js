const express = require("express");
const router = express.Router();

router.get("/ping", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

router.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    service: "Campus-Backend",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
