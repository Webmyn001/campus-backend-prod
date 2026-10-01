const express = require("express");
const {
  adminGetConfig,
  adminUpdateConfig,
  adminSetProductSale,
  adminRemoveFromSale,
  adminCreateSaleProduct,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminGetOrderEnquiry,
  adminNotifyBuyerStage,
  adminDeleteOrder,
} = require("../Controller/oktoberFestController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");

const router = express.Router();

// All admin Oktober Fest routes require admin role
router.use(authMiddleware, adminMiddleware);

router.get("/oktober-fest/config", adminGetConfig);
router.put("/oktober-fest/config", adminUpdateConfig);

router.post("/oktober-fest/products", adminCreateSaleProduct);
router.put("/oktober-fest/products/:id", adminSetProductSale);
router.delete("/oktober-fest/products/:id", adminRemoveFromSale);

router.get("/oktober-fest/orders", adminGetOrders);
router.post("/oktober-fest/orders/:id/status", adminUpdateOrderStatus);
// Prefilled admin -> buyer WhatsApp enquiry (payment confirmed + where to receive)
router.get("/oktober-fest/orders/:id/enquiry", adminGetOrderEnquiry);
// Proactive stage update to the buyer (processing / ready / delivered)
router.post("/oktober-fest/orders/:id/notify", adminNotifyBuyerStage);
// Permanently remove a settled order (completed / cancelled / refunded only)
router.delete("/oktober-fest/orders/:id", adminDeleteOrder);

module.exports = router;