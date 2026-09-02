const express = require("express");
const {
  getCampaigns,
  getInstitutions,
  createListing,
  getListings,
  getListingById,
  getMyListings,
  updateMyListingPrice,
  verifyMarketplacePayment,
  getMyOrders,
  getSellerOrders,
  getOrderById,
  updateOrderStatus,
  confirmReceipt,
  reportProblem,
  savePayoutDetails,
  getBanksList,
  getMyPayouts,
  getMyPayoutInfo,
} = require("../Controller/marketplaceController");
const authMiddleware = require("../Middleware/auth");

const router = express.Router();

// ---- Public ----
router.get("/campaigns", getCampaigns);
router.get("/institutions", getInstitutions);
router.get("/listings", getListings);
router.get("/listings/:id", getListingById);

// ---- Seller (auth) ----
router.post("/listings", authMiddleware, createListing);
router.get("/mine/listings", authMiddleware, getMyListings);
router.put("/listings/:id/price", authMiddleware, updateMyListingPrice);

// ---- Buyer (auth) ----
router.post("/pay/verify", authMiddleware, verifyMarketplacePayment);
router.get("/orders/mine", authMiddleware, getMyOrders);
router.get("/orders/seller", authMiddleware, getSellerOrders);
router.get("/orders/:id", authMiddleware, getOrderById);

// ---- Order lifecycle ----
router.post("/orders/:id/status", authMiddleware, updateOrderStatus);
router.post("/orders/:id/confirm", authMiddleware, confirmReceipt);
router.post("/orders/:id/dispute", authMiddleware, reportProblem);

// ---- Seller payout ----
router.post("/payout/details", authMiddleware, savePayoutDetails);
router.get("/payout/info", authMiddleware, getMyPayoutInfo);
router.get("/payout/banks", authMiddleware, getBanksList);
router.get("/payouts/mine", authMiddleware, getMyPayouts);

module.exports = router;