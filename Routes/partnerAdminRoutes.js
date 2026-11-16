const express = require("express");
const {
  getSettings,
  updateSettings,
  updatePartner,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  publishProduct,
  unpublishProduct,
  importProducts,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getAnalytics,
  listConversions,
  importConversions,
  uploadPartnerImage,
} = require("../Controller/partnerAdminController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

// ---- Settings / partner registry ----
router.get("/settings", getSettings);
router.put("/settings", updateSettings);
router.put("/partners/:key", updatePartner);

// ---- Media ----
router.post("/uploads", uploadPartnerImage);

// ---- Products ----
router.get("/products", listProducts);
router.post("/products", createProduct);
router.post("/products/import", importProducts);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);
router.post("/products/:id/publish", publishProduct);
router.post("/products/:id/unpublish", unpublishProduct);

// ---- Campaigns ----
router.get("/campaigns", listCampaigns);
router.post("/campaigns", createCampaign);
router.put("/campaigns/:id", updateCampaign);
router.delete("/campaigns/:id", deleteCampaign);

// ---- Analytics + confirmed conversions ----
router.get("/analytics", getAnalytics);
router.get("/conversions", listConversions);
router.post("/conversions/import", importConversions);

module.exports = router;
