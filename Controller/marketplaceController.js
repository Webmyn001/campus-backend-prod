const mongoose = require("mongoose");
const Listing = require("../Models/Listing1");
const User = require("../Models/User");
const Campaign = require("../Models/Campaign");
const Institution = require("../Models/Institution");
const MarketplaceOrder = require("../Models/MarketplaceOrder");
const MarketplacePayout = require("../Models/MarketplacePayout");
const cloudinary = require("../config/cloudinary");
const sendEmail = require("../utils/sendEmail");
const paystack = require("../utils/paystack");
const mkt = require("../utils/marketplace");

require("dotenv").config();

const PLATFORM_SUPPORT_EMAIL = process.env.PLATFORM_SUPPORT_EMAIL || "campuscrave0001@gmail.com";

function sellerIdOf(listing) {
  const info = listing.sellerInfo || {};
  return info.id || info._id || listing.sellerId || info;
}

// Build an accepted sellerInfo snapshot from the authenticated user (never from the body)
function buildSellerInfo(user) {
  const u = user || {};
  return {
    id: u._id ? u._id.toString() : String(u.id || ""),
    _id: u._id ? u._id.toString() : String(u.id || ""),
    name: u.name || "",
    username: u.username || "",
    email: u.email || "",
    phone: u.phone || "",
    whatsapp: u.whatsapp || "",
    course: u.course || "",
    year: u.year || "",
    hostel: u.hostel || "",
    school_name: u.school_name || "",
    location_city: u.location_city || "",
    profilePhoto: u.profilePhoto || { url: "" },
  };
}

async function activeCampaignFor({ campaignId, institutionCode }) {
  const now = new Date();
  const base = {};
  if (campaignId && mongoose.Types.ObjectId.isValid(String(campaignId))) base._id = campaignId;
  else if (institutionCode) base.$or = [{ institutionCode: institutionCode.toUpperCase() }, { institutionName: { $regex: new RegExp(`^${institutionCode}$`, "i") } }];
  else return null;

  const candidates = await Campaign.find({ ...base, saleType: "final_year" }).sort({ createdAt: -1 });
  for (const c of candidates) {
    if (c.effectiveStatus() === "active") return c;
  }
  return candidates[0] || null;
}

function notify(to, subject, html) {
  if (!to) return Promise.resolve();
  return sendEmail(to, subject, html).catch((err) =>
    console.error("❌ Marketplace notification email error:", err.message)
  );
}

// ============================================================
// Public: active campaigns + institutions
// ============================================================
exports.getCampaigns = async (req, res) => {
  try {
    const now = new Date();
    const campaigns = await Campaign.find({
      saleType: "final_year",
      $nor: [{ status: "paused" }],
    }).sort({ startDate: -1 });
    const detailed = await Promise.all(
      campaigns.map(async (c) => {
        const inst = c.institutionId
          ? await Institution.findById(c.institutionId).catch(() => null)
          : null;
        return {
          _id: c._id,
          name: c.name,
          tagline: c.tagline,
          description: c.description,
          institutionCode: c.institutionCode || (inst ? inst.code : ""),
          institutionName: c.institutionName || (inst ? inst.name : ""),
          saleType: c.saleType,
          startDate: c.startDate,
          endDate: c.endDate,
          status: c.effectiveStatus(),
        };
      })
    );
    // Only expose currently-running campaigns to the public UI
    res.status(200).json({ success: true, campaigns: detailed.filter((c) => c.status === "active") });
  } catch (err) {
    console.error("❌ getCampaigns error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getInstitutions = async (_req, res) => {
  try {
    const institutions = await Institution.find({ active: true }).sort({ name: 1 });
    res.status(200).json({ success: true, institutions });
  } catch (err) {
    console.error("❌ getInstitutions error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Seller: create a free final-year listing (needs admin approval)
// ============================================================
exports.createListing = async (req, res) => {
  const {
    title,
    category,
    condition,
    workingCondition,
    conditionNote,
    description,
    sellingPrice,
    images,
    pickupLocation,
    deliveryAvailable,
    deliveryFee,
    deliveryArrangement,
    campaignId,
    institutionCode,
  } = req.body;

  try {
    const user = req.user;
    if (!title || !description || !sellingPrice) {
      return res
        .status(400)
        .json({ success: false, message: "Title, description and selling price are required" });
    }

    // Sellers must have bank/payout details on file before they can list on the Final-Year sale.
    if (
      !user ||
      !user.payoutRecipient ||
      !user.payoutRecipient.recipientCode ||
      !user.payoutRecipient.accountName
    ) {
      return res.status(400).json({
        success: false,
        message: "Add your bank/payout details to your seller dashboard before you can list an item.",
      });
    }

    const priceAmount = Number(sellingPrice);
    if (!isFinite(priceAmount) || priceAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a valid selling price" });
    }

    // Electrical categories must state whether the item actually works
    const cat = category || "Other Goods";
    if (["Electronics", "Appliances"].includes(cat)) {
      if (!workingCondition) {
        return res.status(400).json({
          success: false,
          message: "Please state the working condition — buyers need to know it powers on.",
        });
      }
      if (workingCondition !== "Works perfectly" && !String(conditionNote || "").trim()) {
        return res.status(400).json({
          success: false,
          message: "Please describe the fault or issue so buyers know exactly what to expect.",
        });
      }
    }

    // Resolve an active campaign (OAU today, others later - never hard-coded)
    const campaign = await activeCampaignFor({ campaignId, institutionCode });
    if (!campaign || !campaign.isAcceptingNewListings()) {
      return res.status(400).json({
        success: false,
        message: "This sale campaign is no longer accepting new listings.",
      });
    }
    const institution = campaign.institutionId
      ? await Institution.findById(campaign.institutionId).catch(() => null)
      : null;

    let uploadedImages = [];
    if (images && images.length) {
      const uploadPromises = images.map((base64Image) =>
        cloudinary.uploader.upload(base64Image, { folder: "final_year" })
      );
      const results = await Promise.all(uploadPromises);
      uploadedImages = results.map((r) => ({ url: r.secure_url, public_id: r.public_id }));
    }
    if (!uploadedImages.length) {
      return res.status(400).json({ success: false, message: "Please upload at least one photo" });
    }

    const sellerInfo = buildSellerInfo(user);
    const fee = Number(deliveryFee) || 0;

    const listing = await Listing.create({
      title,
      category: category || "Other Goods",
      price: String(priceAmount), // display compat with existing product cards
      priceAmount,
      condition: condition || "Used - Good",
      workingCondition: workingCondition || "",
      conditionNote: conditionNote || "",
      description,
      images: uploadedImages,
      contactMethod: "Phone Call",
      type: "urgent",
      sellerInfo,
      school_name: sellerInfo.school_name,
      location_city: sellerInfo.location_city,
      isUserVerified: !!user.isUserVerified,
      isManaged: false,
      status: "pending",
      saleType: "final_year",
      institution: campaign.institutionName || (institution ? institution.name : ""),
      institutionCode: campaign.institutionCode || (institution ? institution.code : ""),
      institutionId: campaign.institutionId || (institution ? institution._id : undefined),
      campaign: campaign.name,
      campaignId: campaign._id,
      pickupLocation: pickupLocation || "",
      deliveryAvailable: deliveryAvailable === true || deliveryAvailable === "true",
      deliveryFee: deliveryAvailable ? fee : 0,
      deliveryArrangement: deliveryArrangement || "",
      listingState: "active",
    });

    res.status(201).json({ success: true, message: "Listing submitted for review", listing });
  } catch (err) {
    console.error("❌ createListing (final-year) error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Public: browse approved, active final-year listings
// ============================================================
exports.getListings = async (req, res) => {
  try {
    const {
      q,
      category,
      condition,
      minPrice,
      maxPrice,
      sort = "newest",
      page = 1,
      limit = 20,
      campaign,
    } = req.query;

    const query = {
      saleType: "final_year",
      status: "approved",
      listingState: "active",
    };

    if (campaign && mongoose.Types.ObjectId.isValid(String(campaign))) query.campaignId = campaign;
    if (category) query.category = category;
    if (condition) query.condition = condition;

    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      query.$or = [{ title: rx }, { description: rx }, { category: rx }];
    }

    if (minPrice !== undefined && minPrice !== "") {
      query.priceAmount = { ...(query.priceAmount || {}), $gte: Number(minPrice) };
    }
    if (maxPrice !== undefined && maxPrice !== "") {
      query.priceAmount = { ...(query.priceAmount || {}), $lte: Number(maxPrice) };
    }

    let sortObj = { createdAt: -1 };
    if (sort === "price_asc") sortObj = { priceAmount: 1, createdAt: -1 };
    else if (sort === "price_desc") sortObj = { priceAmount: -1, createdAt: -1 };
    else if (sort === "views") sortObj = { views: -1, createdAt: -1 };
    else sortObj = { createdAt: -1 };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [listings, total] = await Promise.all([
      Listing.find(query).sort(sortObj).skip(skip).limit(limitNum),
      Listing.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      listings,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("❌ getListings (final-year) error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// Public: single final-year listing
// ============================================================
exports.getListingById = async (req, res) => {
  const { id } = req.params;
  try {
    let listing;
    if (mongoose.Types.ObjectId.isValid(id)) listing = await Listing.findById(id);
    if (!listing && id.length === 10) {
      listing = await Listing.findOne({
        $expr: {
          $regexMatch: { input: { $toString: "$_id" }, regex: id + "$", options: "i" },
        },
      });
    }
    if (!listing || listing.saleType !== "final_year") {
      return res.status(404).json({ message: "Listing not found" });
    }
    res.status(200).json({ success: true, listing });
  } catch (err) {
    console.error("❌ getListingById (final-year) error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Seller dashboard listings
exports.getMyListings = async (req, res) => {
  try {
    const userId = req.user.id;
    const mine = await Listing.find({
      saleType: "final_year",
      $or: [{ "sellerInfo.id": userId }, { "sellerInfo._id": userId }, { "sellerInfo": userId }],
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, listings: mine });
  } catch (err) {
    console.error("❌ getMyListings (final-year) error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Seller: update the price of their own active final-year listing (e.g. after negotiation)
exports.updateMyListingPrice = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ success: false, message: "Invalid listing" });
    }

    const newPrice = Number(req.body.sellingPrice);
    if (!isFinite(newPrice) || newPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid selling price.",
      });
    }

    const listing = await Listing.findById(id);
    if (!listing || listing.saleType !== "final_year") {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    if (String(sellerIdOf(listing)) !== String(userId)) {
      return res.status(403).json({ success: false, message: "You can only edit your own listings" });
    }

    if (listing.listingState !== "active") {
      return res.status(409).json({
        success: false,
        code: "NOT_EDITABLE",
        message:
          listing.listingState === "pending" || listing.listingState === "rejected"
            ? "This listing is still under review. You can edit once it's live."
            : "This listing can no longer have its price changed.",
      });
    }

    listing.priceAmount = newPrice;
    listing.price = String(newPrice);
    await listing.save();

    res.status(200).json({
      success: true,
      message: "Price updated — buyers will now see the new price at checkout.",
      listing,
    });
  } catch (err) {
    console.error("❌ updateMyListingPrice (final-year) error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Shared: build a marketplace order from a verified Paystack txn
// (used by BOTH the verify endpoint and the webhook => single source of truth)
// ============================================================
async function buildOrderFromVerifiedTx({ tx, buyer, listing, deliveryMethod, deliveryNote = "" }) {
  const sellerRaw = sellerIdOf(listing);
  if (String(sellerRaw) === String(buyer._id)) {
    const err = new Error("You cannot purchase your own item");
    err.status = 400;
    throw err;
  }

  // Amount must come from the DB price + accepted delivery fee (anti price-tamper)
  const delivery = deliveryMethod === "delivery" && listing.deliveryAvailable;
  const effectiveDeliveryFee = delivery ? Number(listing.deliveryFee) || 0 : 0;
  const expectedTotalKobo = mkt.toKobo(mkt.computeOrderTotal(listing.priceAmount, effectiveDeliveryFee));
  if (tx.amount !== expectedTotalKobo) {
    const err = new Error("Payment amount does not match listing price");
    err.status = 400;
    err.code = "PRICE_MISMATCH";
    throw err;
  }

  // Atomically reserve the listing so it can't be purchased twice
  const reserved = await Listing.findOneAndUpdate(
    { _id: listing._id, listingState: "active" },
    { $set: { listingState: "reserved" } },
    { new: true }
  );
  if (!reserved) {
    const err = new Error("Sorry, this item has just been purchased");
    err.status = 409;
    err.code = "ALREADY_BOUGHT";
    throw err;
  }

  const priceAmount = Number(listing.priceAmount) || 0;
  const platformFee = mkt.computePlatformFee(priceAmount);
  const sellerAmount = mkt.computeSellerAmount(priceAmount);
  const totalPaid = mkt.computeOrderTotal(priceAmount, effectiveDeliveryFee);

  const order = await MarketplaceOrder.create({
    orderNumber: mkt.generateOrderNumber(),
    buyerId: buyer._id,
    buyerName: buyer.name || "",
    buyerEmail: buyer.email || "",
    buyerPhone: buyer.phone || "",
    sellerId: sellerRaw,
    sellerName: (listing.sellerInfo && listing.sellerInfo.name) || "",
    listingId: listing._id,
    campaignId: listing.campaignId || undefined,
    campaignName: listing.campaign || "",
    institutionCode: listing.institutionCode || "",
    listingSnapshot: {
      title: listing.title,
      image: listing.images && listing.images[0] ? listing.images[0].url : "",
      category: listing.category,
      condition: listing.condition,
      workingCondition: listing.workingCondition || "",
      conditionNote: listing.conditionNote || "",
      priceAmount,
      sellerName: (listing.sellerInfo && listing.sellerInfo.name) || "",
      pickupLocation: listing.pickupLocation || "",
    },
    priceAmount,
    platformFee,
    sellerAmount,
    deliveryFee: effectiveDeliveryFee,
    totalPaid,
    currency: tx.currency || "NGN",
    deliveryMethod: delivery ? "delivery" : "pickup",
    deliveryNote: deliveryNote || "",
    paymentReference: tx.reference,
    paymentStatus: "verified",
    orderStatus: "processing",
    deliveryStatus: delivery ? "pending" : "pickup",
    payoutStatus: "none",
  });

  notify(
    listing.sellerInfo && listing.sellerInfo.email,
    "You have a new sale on CampusCrave!",
    `<p>Hello ${(listing.sellerInfo && listing.sellerInfo.name) || "Seller"},</p>
     <p>Great news! Your item <strong>${listing.title}</strong> has been purchased and payment verified via Paystack.</p>
     <p>Order total: ${order.totalPaid.toLocaleString()} NGN (${order.deliveryMethod === "delivery" ? "delivery" : "pickup"}).</p>
     <p>Please arrange delivery or pickup with the buyer. You'll be paid after the buyer confirms receipt.</p>
     <p>Best regards,<br/>CampusCrave Team</p>`
  );

  // Notify the platform admin so they know a final-year order needs coordination:
  // they may need to help the buyer get the item, or refund + credit the seller.
  notify(
    PLATFORM_SUPPORT_EMAIL,
    "New final-year purchase needs your attention — order #" + order.orderNumber,
    `<p>Hello Admin,</p>
     <p>A new final-year marketplace order was just created and needs your attention.</p>
     <p><strong>Order:</strong> #${order.orderNumber}</p>
     <p><strong>Item:</strong> ${order.listingSnapshot.title}</p>
     <p><strong>Buyer:</strong> ${order.buyerName || order.buyerEmail || "—"} (${order.buyerEmail || "no email"})</p>
     <p><strong>Seller:</strong> ${order.sellerName || "—"} · ${(listing.sellerInfo && listing.sellerInfo.whatsapp) || "no WhatsApp"}</p>
     <p><strong>Amount paid:</strong> ${order.totalPaid.toLocaleString()} NGN · ${order.deliveryMethod === "delivery" ? "Delivery" : "Campus Pickup"}</p>
     <p>Please contact the buyer to coordinate how they receive the item. If the seller is not willing to sell,
        refund the buyer and credit the seller using the seller's saved payout details.</p>
     <p>Best regards,<br/>CampusCrave</p>`
  );

  // Mark the order as having notified the admin
  await MarketplaceOrder.findByIdAndUpdate(order._id, {
    $set: { adminNotified: true, adminNotifiedAt: new Date() },
  });

  return order;
}

// ============================================================
// Buyer: verify Paystack payment server-side and create the order
// ============================================================
exports.verifyMarketplacePayment = async (req, res) => {
  const { reference, listingId, deliveryMethod, deliveryNote } = req.body;
  try {
    if (!reference || !listingId) {
      return res.status(400).json({ success: false, message: "Reference and listing are required" });
    }
    const note = typeof deliveryNote === "string" ? deliveryNote.slice(0, 300) : "";

    const listing = await Listing.findById(listingId);
    if (!listing || listing.saleType !== "final_year" || listing.status !== "approved" || listing.listingState !== "active") {
      return res.status(409).json({ success: false, code: "ALREADY_BOUGHT", message: "Sorry, this item is no longer available" });
    }

    // Server-side verification - never trust the frontend "Payment Successful"
    const tx = await paystack.verifyTransaction(reference);
    if (!tx || tx.status !== "success") {
      return res.status(400).json({ success: false, message: "Payment not confirmed on Paystack" });
    }

    // Idempotency: canonical paystackRef already used? return the existing order
    const existing = await MarketplaceOrder.findOne({ paymentReference: tx.reference });
    if (existing) {
      if (existing.paymentStatus !== "verified") {
        await MarketplaceOrder.findByIdAndUpdate(existing._id, { $set: { paymentStatus: "verified", orderStatus: "processing" } });
      }
      return res.status(200).json({ success: true, message: "Payment already verified", order: existing });
    }

    const order = await buildOrderFromVerifiedTx({
      tx,
      buyer: req.user,
      listing,
      deliveryMethod: deliveryMethod === "delivery" ? "delivery" : "pickup",
      deliveryNote: note,
    });

    res.status(201).json({ success: true, message: "Payment verified. Order created.", order });
  } catch (err) {
    console.error("❌ verifyMarketplacePayment error:", err);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || "SERVER_ERROR",
      message: err.message || "Server error",
    });
  }
};

// ============================================================
// Webhook branch (called from the single Paystack webhook when
// metadata.type === "marketplace_purchase")
// ============================================================
exports.handleMarketplaceWebhook = async (event) => {
  const data = event.data || {};
  const metadata = data.metadata || {};

  if (event.event === "charge.success") {
    const reference = data.reference;
    let order = await MarketplaceOrder.findOne({ paymentReference: reference });

    if (order) {
      if (order.paymentStatus !== "verified") {
        await MarketplaceOrder.findByIdAndUpdate(order._id, {
          $set: { paymentStatus: "verified", orderStatus: "processing" },
        });
        // Best-effort reservation
        await Listing.findOneAndUpdate(
          { _id: order.listingId, listingState: "active" },
          { $set: { listingState: "reserved" } }
        );
      }
      return { handled: true, action: "order_verified" };
    }

    // Robustness path: webhook arrived before the verify endpoint call
    const listingId = metadata.listingId;
    const buyerId = metadata.buyerId || metadata.userId;
    if (listingId && buyerId) {
      const tx = await paystack.verifyTransaction(reference).catch(() => null);
      const [buyer, listing] = await Promise.all([
        User.findById(buyerId).catch(() => null),
        Listing.findById(listingId).catch(() => null),
      ]);
      if (tx && tx.status === "success" && buyer && listing) {
        const order2 = await buildOrderFromVerifiedTx({
          tx,
          buyer,
          listing,
          deliveryMethod: metadata.deliveryMethod === "delivery" ? "delivery" : "pickup",
          deliveryNote: metadata.note || "",
        });
        return { handled: true, action: "order_created_from_webhook" };
      }
    }
    return { handled: false };
  }

  if (event.event === "transfer.success") {
    const transfer = data.transfer || data || {};
    const reference = transfer.reference;
    const transferCode = transfer.transfer_code || transfer.code;
    const payout = reference
      ? await MarketplacePayout.findOne({ transferReference: reference })
      : await MarketplacePayout.findOne({ transferCode: transferCode });

    if (!payout) return { handled: false };

    if (!["paid", "cancelled"].includes(payout.status)) {
      await MarketplacePayout.findByIdAndUpdate(payout._id, {
        $set: { status: "paid", paidAt: new Date(), transferCode: transferCode || payout.transferCode },
      });
      await MarketplaceOrder.findByIdAndUpdate(payout.orderId, {
        $set: {
          payoutStatus: "paid",
          orderStatus: "seller_paid",
        },
      });
      // Mark the listing sold forever (history preserved, not deleted)
      const order = await MarketplaceOrder.findById(payout.orderId);
      if (order) {
        await Listing.findByIdAndUpdate(order.listingId, {
          $set: { listingState: "sold", soldOut: true },
        });
      }
      return { handled: true, action: "transfer_paid" };
    }
    return { handled: true, action: "already_paid" };
  }

  if (event.event === "transfer.failed") {
    const transfer = data.transfer || data || {};
    const reference = transfer.reference;
    const payout = reference
      ? await MarketplacePayout.findOne({ transferReference: reference })
      : await MarketplacePayout.findOne({ transferCode: transfer.transfer_code || transfer.code });
    if (!payout) return { handled: false };
    await MarketplacePayout.findByIdAndUpdate(payout._id, {
      $set: { status: "failed", failureReason: (transfer.failure_reason || "") && String(transfer.failure_reason) },
    });
    await MarketplaceOrder.findByIdAndUpdate(payout.orderId, {
      $set: { payoutStatus: "failed", orderStatus: "buyer_confirmed" },
    });
    return { handled: true, action: "transfer_failed" };
  }

  return { handled: false };
};

// ============================================================
// Buyer: my marketplace orders
// ============================================================
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await MarketplaceOrder.find({ buyerId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("❌ getMyOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Seller: orders on their listings
exports.getSellerOrders = async (req, res) => {
  try {
    const orders = await MarketplaceOrder.find({ sellerId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("❌ getSellerOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await MarketplaceOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const isBuyer = String(order.buyerId) === String(req.user._id);
    const isSeller = String(order.sellerId) === String(req.user._id);
    const isAdmin = req.user.role === "admin";
    if (!isBuyer && !isSeller && !isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    res.status(200).json({ success: true, order });
  } catch (err) {
    console.error("❌ getOrderById error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Seller: advance delivery status
// ============================================================
exports.updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // ready_for_pickup | out_for_delivery | delivered
  try {
    const order = await MarketplaceOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (String(order.sellerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (order.orderStatus === "disputed") {
      return res.status(400).json({ success: false, message: "This order has a dispute. Await admin resolution." });
    }

    const allowed = {
      processing: ["ready_for_pickup", "out_for_delivery", "delivered"],
      ready_for_pickup: ["out_for_delivery", "delivered"],
      out_for_delivery: ["delivered"],
    };
    const next = allowed[order.orderStatus] || [];
    if (!next.includes(action)) {
      return res.status(400).json({ success: false, message: `Cannot move from ${order.orderStatus} to ${action}` });
    }

    const deliveryMap = {
      ready_for_pickup: "ready_for_pickup",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
    };

    const updated = await MarketplaceOrder.findByIdAndUpdate(
      id,
      { $set: { orderStatus: action, deliveryStatus: deliveryMap[action] || order.deliveryStatus } },
      { new: true }
    );

    notify(
      order.buyerEmail,
      "Your order status has changed",
      `<p>Hello ${order.buyerName || "there"},</p>
       <p>Order <strong>${order.orderNumber}</strong> is now: <strong>${action.replace(/_/g, " ")}</strong>.</p>
       <p>Track it from your dashboard on CampusCrave.</p>
       <p>Best regards,<br/>CampusCrave Team</p>`
    );

    res.status(200).json({ success: true, order: updated });
  } catch (err) {
    console.error("❌ updateOrderStatus error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Buyer: confirm receipt -> makes payout eligible
// ============================================================
exports.confirmReceipt = async (req, res) => {
  const { id } = req.params;
  try {
    const order = await MarketplaceOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (String(order.buyerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!["delivered", "ready_for_pickup", "out_for_delivery"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Items can only be confirmed once ${order.orderStatus === "buyer_confirmed" ? "confirmed already" : "they are delivered or ready for pickup"}`,
      });
    }
    if (order.orderStatus === "disputed") {
      return res.status(400).json({ success: false, message: "This order has a dispute" });
    }
    if (order.buyerConfirmed) {
      return res.status(200).json({ success: true, message: "Already confirmed", order });
    }

    const now = new Date();

    // Create the payout record once (idempotent via payoutReference unique)
    const existingPayout = await MarketplacePayout.findOne({ orderId: order._id });
    if (!existingPayout) {
      await MarketplacePayout.create({
        payoutReference: mkt.generateReference("PO"),
        orderId: order._id,
        sellerId: order.sellerId,
        amount: order.sellerAmount,
        platformFee: order.platformFee,
        status: "pending",
      });
    }

    const updated = await MarketplaceOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          buyerConfirmed: true,
          buyerConfirmedAt: now,
          orderStatus: "buyer_confirmed",
          deliveryStatus: "delivered",
          payoutStatus: "pending",
        },
      },
      { new: true }
    );

    const seller = await User.findById(order.sellerId).catch(() => null);
    notify(
      seller && seller.email,
      "A buyer confirmed your item",
      `<p>Hello ${seller && seller.name ? seller.name : ""},</p><p>Order <strong>${order.orderNumber}</strong> has been confirmed received by the buyer. Your payout is now eligible and will be processed shortly.</p><p>Best regards,<br/>CampusCrave Team</p>`
    );

    res.status(200).json({ success: true, message: "Item confirmed. Thank you!", order: updated });
  } catch (err) {
    console.error("❌ confirmReceipt error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Buyer: report a problem / open a dispute
// ============================================================
const DISPUTE_REASONS = [
  "Item not delivered",
  "Wrong item",
  "Damaged item",
  "Item significantly different from description",
  "Seller unavailable",
  "Other",
];

exports.reportProblem = async (req, res) => {
  const { id } = req.params;
  const { reason, details } = req.body;
  try {
    const order = await MarketplaceOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (String(order.buyerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (["completed", "refunded", "cancelled"].includes(order.orderStatus)) {
      return res.status(400).json({ success: false, message: "This order can no longer be disputed" });
    }
    if (!DISPUTE_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: "Please choose a valid problem reason" });
    }
    if (order.dispute && order.dispute.status === "open") {
      return res.status(400).json({ success: false, message: "A dispute is already open for this order" });
    }

    const payoutStatus = ["pending", "processed"].includes(order.payoutStatus) ? "paused" : order.payoutStatus;

    const updated = await MarketplaceOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          orderStatus: "disputed",
          payoutStatus,
          "dispute.reason": reason,
          "dispute.details": (details || "").slice(0, 2000),
          "dispute.status": "open",
          "dispute.openedAt": new Date(),
        },
      },
      { new: true }
    );

    // Pause any pending payout record
    await MarketplacePayout.updateMany(
      { orderId: order._id, status: { $in: ["pending", "initiated", "processed"] } },
      { $set: { status: "paused" } }
    );

    notify(
      PLATFORM_SUPPORT_EMAIL,
      `New marketplace dispute: ${order.orderNumber}`,
      `<p>A buyer opened a dispute on order <strong>${order.orderNumber}</strong>.</p><p>Reason: ${reason}</p><p>Details: ${details || "N/A"}</p>`
    );

    res.status(200).json({ success: true, message: "Problem reported. Our team will review it.", order: updated });
  } catch (err) {
    console.error("❌ reportProblem error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Seller: payout bank details (Paystack transfer recipient)
// ============================================================
exports.savePayoutDetails = async (req, res) => {
  const { bankCode, bankName, accountNumber, accountName } = req.body;
  try {
    if (!bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ success: false, message: "Bank, account number and account name are required" });
    }
    const user = req.user;

    // Idempotent: same bank + same number twice? return existing recipient
    if (
      user.payoutRecipient &&
      user.payoutRecipient.accountNumber === String(accountNumber) &&
      user.payoutRecipient.recipientCode
    ) {
      return res.status(200).json({ success: true, message: "Payout details already saved", recipient: user.payoutRecipient });
    }

    // Verify the account name against the bank (Paystack/Interswitch resolution)
    const resolved = await paystack.resolveAccount(bankCode, String(accountNumber)).catch(() => null);
    if (resolved && resolved.account_name) {
      const normA = String(resolved.account_name).toLowerCase().replace(/\s+/g, " ");
      const normB = String(accountName).toLowerCase().replace(/\s+/g, " ");
      if (normB && normA.replace(/\./g, "").includes(normB.replace(/\./g, "")) === false && !normA.includes(normB)) {
        return res.status(400).json({
          success: false,
          message: `The account name doesn't match the bank record. Bank name: ${resolved.account_name}`,
          resolvedName: resolved.account_name,
        });
      }
    }

    const recipient = await paystack.createTransferRecipient({
      name: String(accountName).trim(),
      account_number: String(accountNumber).trim(),
      bank_code: String(bankCode).trim(),
    });

    const updated = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          "payoutRecipient.bankName": bankName || "",
          "payoutRecipient.accountNumber": String(accountNumber).trim(),
          "payoutRecipient.accountName": String(accountName).trim(),
          "payoutRecipient.recipientCode": recipient.recipient_code,
          "payoutRecipient.updatedAt": new Date(),
        },
      },
      { new: true }
    ).select("payoutRecipient");

    res.status(200).json({ success: true, message: "Payout details saved", recipient: updated.payoutRecipient });
  } catch (err) {
    console.error("❌ savePayoutDetails error:", err.message);
    res.status(400).json({ success: false, message: err.message || "Could not save payout details" });
  }
};

exports.getBanksList = async (_req, res) => {
  try {
    const banks = await paystack.getBanks();
    res.status(200).json({ success: true, banks });
  } catch (err) {
    console.error("❌ getBanksList error:", err.message);
    res.status(400).json({ success: false, message: err.message || "Could not load banks" });
  }
};

exports.getMyPayouts = async (req, res) => {
  try {
    const payouts = await MarketplacePayout.find({ sellerId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, payouts });
  } catch (err) {
    console.error("❌ getMyPayouts error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Whether the current user has payout/bank details on file (seller can list).
exports.getMyPayoutInfo = async (req, res) => {
  try {
    const user = req.user;
    const p = user && user.payoutRecipient;
    const hasDetails = !!(p && p.recipientCode && p.accountName);
    res.status(200).json({
      success: true,
      hasDetails,
      recipient: p
        ? {
            bankName: p.bankName || "",
            accountNumber: p.accountNumber ? "••••" + String(p.accountNumber).slice(-4) : "",
            accountName: p.accountName || "",
          }
        : null,
    });
  } catch (err) {
    console.error("❌ getMyPayoutInfo error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};