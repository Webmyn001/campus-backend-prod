const express = require("express");
const {
  getCampaignConfig,
  getOktoberFestProducts,
  verifyStorePayment,
  getMyStoreOrders,
  confirmStoreReceipt,
} = require("../Controller/oktoberFestController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// ---- Public ----
router.get("/config", getCampaignConfig);
router.get("/products", getOktoberFestProducts);

// ---- Buyer (auth) ----
router.post("/pay/verify", authMiddleware, verifyStorePayment);
router.get("/orders/mine", authMiddleware, getMyStoreOrders);
router.post("/orders/:id/confirm", authMiddleware, confirmStoreReceipt);

module.exports = router;