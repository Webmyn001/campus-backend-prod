const express = require("express");
const {
  getAllListings,
  approveListing,
  rejectListing,
  requestChanges,
  editListing,
  suspendListing,
  activateListing,
  markSoldListing,
  removeListing,
  getListingAction,
  getAllOrders,
  getOrderById,
  resolveDispute,
  getAllPayouts,
  processPayout,
  markPayoutPaid,
  completeOrder,
  getFinancials,
  setFinancialsReset,
  clearFinancialsReset,
  getAllCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getAllInstitutions,
  createInstitution,
  deleteInstitution,
} = require("../Controller/marketplaceAdminController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");

const router = express.Router();

// All admin marketplace routes require admin role
router.use(authMiddleware, adminMiddleware);

// ---- Listings ----
router.get("/marketplace/listings", getAllListings);
router.put("/marketplace/listings/:id/approve", approveListing);
router.put("/marketplace/listings/:id/reject", rejectListing);
router.put("/marketplace/listings/:id/request-changes", requestChanges);
router.put("/marketplace/listings/:id/edit", editListing);
router.put("/marketplace/listings/:id/suspend", suspendListing);
router.put("/marketplace/listings/:id/activate", activateListing);
router.put("/marketplace/listings/:id/mark-sold", markSoldListing);
router.delete("/marketplace/listings/:id", removeListing);
router.get("/marketplace/listings/:id/action", getListingAction);

// ---- Orders + disputes ----
router.get("/marketplace/orders", getAllOrders);
router.get("/marketplace/orders/:id", getOrderById);
router.post("/marketplace/orders/:id/resolve", resolveDispute);
router.post("/marketplace/orders/:id/complete", completeOrder);

// ---- Payouts ----
router.get("/marketplace/payouts", getAllPayouts);
router.post("/marketplace/payouts/:id/process", processPayout);
router.post("/marketplace/payouts/:id/mark-paid", markPayoutPaid);

// ---- Financials ----
router.get("/marketplace/financials", getFinancials);
router.post("/marketplace/financials/reset", setFinancialsReset);
router.post("/marketplace/financials/reset/clear", clearFinancialsReset);

// ---- Campaigns ----
router.get("/marketplace/campaigns", getAllCampaigns);
router.post("/marketplace/campaigns", createCampaign);
router.put("/marketplace/campaigns/:id", updateCampaign);
router.delete("/marketplace/campaigns/:id", deleteCampaign);

// ---- Institutions ----
router.get("/marketplace/institutions", getAllInstitutions);
router.post("/marketplace/institutions", createInstitution);
router.delete("/marketplace/institutions/:id", deleteInstitution);

module.exports = router;