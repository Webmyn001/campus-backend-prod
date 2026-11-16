const express = require("express");
const {
  getPartnerConfig,
  getPartnerProducts,
  getPartnerProductById,
  getPartnerBanners,
  createPartnerClick,
  redirectPartnerClick,
} = require("../Controller/partnerController");
const { handlePartnerWebhook } = require("../Controller/partnerWebhookController");
const optionalAuth = require("../Middleware/optionalAuth");
const rateLimit = require("../Middleware/rateLimit");

const router = express.Router();

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  prefix: "partner-click",
  message: "Too many partner clicks. Please slow down.",
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  prefix: "partner-webhook",
  message: "Too many webhook deliveries.",
});

// ---- Public catalogue ----
router.get("/config", getPartnerConfig);
router.get("/banners", getPartnerBanners);
router.get("/products", getPartnerProducts);
router.get("/products/:id", getPartnerProductById);

// ---- Tracked outbound clicks ----
router.post("/click", clickLimiter, optionalAuth, createPartnerClick);
router.get("/go/:clickId", redirectPartnerClick);

// ---- Signed partner webhooks (conversions only) ----
router.post("/webhooks/:partner", webhookLimiter, handlePartnerWebhook);

module.exports = router;
