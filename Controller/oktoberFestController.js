const mongoose = require("mongoose");
const Product = require("../Models/Product");
const StoreOrder = require("../Models/StoreOrder");
const Setting = require("../Models/Setting");
const paystack = require("../utils/paystack");
const sendEmail = require("../utils/sendEmail");
const mkt = require("../utils/marketplace");

const CAMPAIGN_SETTING_KEY = "oktober_fest_campaign";
const PLATFORM_SUPPORT_EMAIL = process.env.PLATFORM_SUPPORT_EMAIL || "campuscrave0001@gmail.com";

function notify(to, subject, html) {
  if (!to) return Promise.resolve();
  return sendEmail(to, subject, html).catch((err) =>
    console.error("❌ Oktober Fest notification email error:", err.message)
  );
}

// ============================================================
// Campaign-level configuration (stored in the shared Setting store)
// ============================================================
async function getCampaignSetting() {
  const doc = await Setting.findOne({ key: CAMPAIGN_SETTING_KEY });
  const raw = (doc && doc.value) || {};
  return {
    active: !!raw.active,
    startDate: raw.startDate || null,
    endDate: raw.endDate || null,
    heroTitle: raw.heroTitle || "Campus Crave Oktober Fest",
    heroTagline: raw.heroTagline || "Massive Discounts. Limited Deals. Don't Miss Out.",
  };
}

function campaignLive(config) {
  if (!config || !config.active) return false;
  const now = new Date();
  if (config.startDate && new Date(config.startDate) > now) return false;
  if (config.endDate && new Date(config.endDate) < now) return false;
  return true;
}

// Whether a product is currently an active Oktober Fest product.
function productSaleActive(product, config) {
  const os = product.oktoberFest || {};
  if (!os.enabled) return false;
  if (product.type !== "admin-gadget" && product.type !== "admin-food") return false;
  if (!campaignLive(config)) return false;
  if (os.startDate && new Date(os.startDate) > new Date()) return false;
  if (os.endDate && new Date(os.endDate) < new Date()) return false;
  const original = Number(os.originalPrice) || 0;
  const sale = Number(os.salePrice) || 0;
  if (!(original > 0 && sale > 0 && sale < original)) return false;
  return true;
}

function remainingStock(product) {
  const os = product.oktoberFest || {};
  const stock = Math.max(0, Number(os.stock) || 0);
  const sold = Math.max(0, Number(os.soldCount) || 0);
  return Math.max(0, stock - sold);
}

function discountPercentOf(os) {
  const original = Number(os.originalPrice) || 0;
  const sale = Number(os.salePrice) || 0;
  if (!(original > 0 && sale > 0 && sale < original)) return 0;
  return Math.round(((original - sale) / original) * 100);
}

// Serialize a product into its "Oktober Fest" public shape.
function serializeSaleProduct(product, config) {
  const os = product.oktoberFest || {};
  const active = productSaleActive(product, config);
  const original = Number(os.originalPrice) || Number(product.price) || 0;
  const sale = active && Number(os.salePrice) > 0 ? Number(os.salePrice) : Number(product.price) || 0;
  const remaining = remainingStock(product);
  const trulySoldOut = !active ? false : remaining <= 0 || product.soldOut;

  return {
    _id: product._id,
    name: product.name,
    description: product.description,
    fullDescription: product.fullDescription,
    category: product.category,
    type: product.type,
    // `null` when the admin never set a lead time, so the card stays silent.
    maxDeliveryDays: Number(product.maxDeliveryDays) > 0 ? Number(product.maxDeliveryDays) : null,
    mainImage: product.mainImage,
    images: product.images,
    price: Number(product.price) || 0,
    originalPrice: original,
    salePrice: active ? Number(os.salePrice) || original : original,
    discountPercent: active ? discountPercentOf(os) : 0,
    oktoberFestActive: active,
    soldOut: trulySoldOut,
    remaining: active ? remaining : 0,
    lowStock: active && !trulySoldOut && remaining <= 5,
    availability: product.availability,
  };
}

// ============================================================
// Public
// ============================================================
exports.getCampaignConfig = async (_req, res) => {
  try {
    const config = await getCampaignSetting();
    res.status(200).json({ success: true, campaign: config, active: campaignLive(config) });
  } catch (err) {
    console.error("❌ oktoberFest getCampaignConfig error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getOktoberFestProducts = async (_req, res) => {
  try {
    const config = await getCampaignSetting();
    const products = await Product.find({
      type: { $in: ["admin-gadget", "admin-food"] },
    }).sort({ postedAt: -1 });

    const saleProducts = products
      .map((p) => serializeSaleProduct(p, config))
      .filter((p) => p.oktoberFestActive);

    res.status(200).json({ success: true, products: saleProducts, active: campaignLive(config) });
  } catch (err) {
    console.error("❌ oktoberFest getOktoberFestProducts error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Helpers shared by verify + webhook
// ============================================================
function computeStoreTotal(product, config, quantity) {
  const os = product.oktoberFest || {};
  const unit = productSaleActive(product, config) ? Number(os.salePrice) || 0 : 0;
  const qty = Math.max(1, Number(quantity) || 1);
  return { unitPrice: unit, quantity: qty, total: mkt.roundToKobo(unit * qty) };
}

async function buildStoreOrderFromVerifiedTx({ tx, buyer, product, quantity, deliveryMethod, deliveryNote = "", deliveryZone = "ile_ife", deliveryLocation = "", deliveryPhone = "" }) {
  const config = await getCampaignSetting();
  const os = product.oktoberFest || {};
  const original = Number(os.originalPrice) || Number(product.price) || 0;

  const { unitPrice, quantity: qty, total } = computeStoreTotal(product, config, quantity);
  if (!(unitPrice > 0)) {
    const err = new Error("This product is not an active Oktober Fest item");
    err.status = 400;
    err.code = "NOT_IN_SALE";
    throw err;
  }

  const expectedKobo = mkt.toKobo(total);
  if (tx.amount !== expectedKobo) {
    const err = new Error("Payment amount does not match the Oktober Fest price");
    err.status = 400;
    err.code = "PRICE_MISMATCH";
    throw err;
  }

  // Atomically reserve stock (remaining = stock - soldCount). Never oversell.
  const reserved = await Product.findOneAndUpdate(
    {
      _id: product._id,
      $expr: { $gte: [{ $subtract: [{ $ifNull: ["$oktoberFest.stock", 0] }, { $ifNull: ["$oktoberFest.soldCount", 0] }] }, qty] },
    },
    { $inc: { "oktoberFest.soldCount": qty } },
    { new: false }
  );
  if (!reserved) {
    // Roll any earlier webhook stock deduction back if the order could not be created.
    const err = new Error("Sorry, this item has just sold out");
    err.status = 409;
    err.code = "SOLD_OUT";
    throw err;
  }

  const order = await StoreOrder.create({
    orderNumber: mkt.generateOrderNumber(),
    saleFlag: "oktober",
    buyerId: buyer._id,
    buyerName: buyer.name || "",
    buyerEmail: buyer.email || "",
    buyerPhone: (deliveryZone === "outside" ? deliveryPhone : "") || buyer.phone || "",
    buyerWhatsapp: buyer.whatsapp || buyer.phone || deliveryPhone || "",
    buyerAddress: deliveryLocation || "",
    productId: product._id,
    productSnapshot: {
      name: product.name,
      image: (product.mainImage && product.mainImage.url) || (product.images && product.images[0] && product.images[0].url) || "",
      category: product.category,
      type: product.type,
      maxDeliveryDays: Number(product.maxDeliveryDays) > 0 ? Number(product.maxDeliveryDays) : null,
    },
    quantity: qty,
    originalPrice: original,
    unitPrice,
    discountPercent: discountPercentOf(os),
    totalPaid: total,
    currency: tx.currency || "NGN",
    deliveryMethod: deliveryMethod === "delivery" ? "delivery" : "pickup",
    deliveryNote: deliveryNote || "",
    paymentReference: tx.reference,
    paymentStatus: "verified",
    orderStatus: "processing",
    deliveryStatus: deliveryMethod === "delivery" ? "pending" : "ready_for_pickup",
    statusHistory: [
      { status: "pending_payment", label: TRACKING_LABELS.pending_payment, note: "Order placed, awaiting payment", by: "buyer", at: new Date() },
      { status: "payment_received", label: TRACKING_LABELS.payment_received, note: "Payment confirmed by Campus Crave", by: "system", at: new Date() },
      { status: "processing", label: TRACKING_LABELS.processing, note: "We are preparing your item", by: "system", at: new Date() },
    ],
  });

  notify(
    PLATFORM_SUPPORT_EMAIL,
    "🎃 New Oktober Fest order needs your attention — #" + order.orderNumber,
    `<p>Hello Admin,</p>
     <p>A new <strong>Campus Crave Oktober Fest</strong> order was just placed and payment verified.</p>
     <p><strong>Order:</strong> #${order.orderNumber}</p>
     <p><strong>Item:</strong> ${order.productSnapshot.name} × ${order.quantity}</p>
     <p><strong>Buyer:</strong> ${order.buyerName || order.buyerEmail || "—"} (${order.buyerEmail || "no email"})</p>
     ${order.deliveryMethod === "delivery" ? `<p><strong>Deliver to:</strong> ${order.buyerAddress || "—"} · ${order.buyerPhone || "no phone"}</p>` : ""}
     <p><strong>Amount paid:</strong> ${order.totalPaid.toLocaleString()} NGN · ${order.deliveryMethod === "delivery" ? "Delivery" : "Campus Pickup"}</p>
     <p>Please arrange fulfilment with the buyer.</p>
     <p>Best regards,<br/>CampusCrave</p>`
  );

  await StoreOrder.findByIdAndUpdate(order._id, { $set: { adminNotified: true, adminNotifiedAt: new Date() } });
  return order;
}

// ============================================================
// Buyer: verify Paystack payment server-side and create the order
// ============================================================
exports.verifyStorePayment = async (req, res) => {
  const { reference, productId, quantity, deliveryMethod, deliveryNote, deliveryZone, deliveryLocation, deliveryPhone } = req.body;
  try {
    if (!reference || !productId) {
      return res.status(400).json({ success: false, message: "Reference and product are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(productId))) {
      return res.status(400).json({ success: false, message: "Invalid product" });
    }
    const qty = Math.max(1, Math.min(50, Number(quantity) || 1));
    const note = typeof deliveryNote === "string" ? deliveryNote.slice(0, 300) : "";
    const zone = deliveryZone === "outside" ? "outside" : "ile_ife";
    const location = typeof deliveryLocation === "string" ? deliveryLocation.trim().slice(0, 200) : "";
    const phone = typeof deliveryPhone === "string" ? deliveryPhone.trim().slice(0, 30) : "";

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const config = await getCampaignSetting();
    if (!productSaleActive(product, config)) {
      return res.status(409).json({ success: false, code: "NOT_IN_SALE", message: "This item is not currently on the Oktober Fest" });
    }
    if (remainingStock(product) < qty) {
      return res.status(409).json({ success: false, code: "SOLD_OUT", message: "Sorry, this item has just sold out" });
    }

    // Server-side verification — never trust the frontend "Payment Successful"
    const tx = await paystack.verifyTransaction(reference);
    if (!tx || tx.status !== "success") {
      return res.status(400).json({ success: false, message: "Payment not confirmed on Paystack" });
    }

    // Idempotency: canonical paystack reference already used?
    const existing = await StoreOrder.findOne({ paymentReference: tx.reference });
    if (existing) {
      if (existing.paymentStatus !== "verified") {
        await StoreOrder.findByIdAndUpdate(existing._id, {
          $set: { paymentStatus: "verified", orderStatus: "processing" },
        });
      }
      return res.status(200).json({ success: true, message: "Payment already verified", order: existing });
    }

    const order = await buildStoreOrderFromVerifiedTx({
      tx,
      buyer: req.user,
      product,
      quantity: qty,
      deliveryMethod: deliveryMethod === "delivery" ? "delivery" : "pickup",
      deliveryNote: note,
      deliveryZone: zone,
      deliveryLocation: location,
      deliveryPhone: phone,
    });

    res.status(201).json({
      success: true,
      message: "Payment verified. Order created.",
      order,
      // Tell the buyer exactly where to watch the order progress.
      tracking: {
        headline: "Payment received — we're processing your order",
        message:
          "Your payment is confirmed. Open Track my order in your CampusCrave dashboard to follow every step, from payment to delivery.",
        trackingUrl: "/oktober-fest/orders",
        whatsappHint: "We will also message you on WhatsApp when your item is ready or on its way.",
      },
    });
  } catch (err) {
    console.error("❌ verifyStorePayment error:", err);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      code: err.code || "SERVER_ERROR",
      message: err.message || "Server error",
    });
  }
};

// ============================================================
// Webhook branch (metadata.type === "oktober_fest_purchase")
// ============================================================
exports.handleStoreSaleWebhook = async (event) => {
  const data = event.data || {};
  const metadata = data.metadata || {};

  if (event.event === "charge.success") {
    const reference = data.reference;
    let order = await StoreOrder.findOne({ paymentReference: reference });

    if (order) {
      if (order.paymentStatus !== "verified") {
        await StoreOrder.findByIdAndUpdate(order._id, {
          $set: { paymentStatus: "verified", orderStatus: "processing" },
        });
      }
      return { handled: true, action: "store_order_verified" };
    }

    // Robustness path: webhook arrived before the verify endpoint call
    const productId = metadata.productId;
    const buyerId = metadata.buyerId || metadata.userId;
    if (productId && buyerId) {
      const tx = await paystack.verifyTransaction(reference).catch(() => null);
      const [buyer, product] = await Promise.all([
        require("../Models/User").findById(buyerId).catch(() => null),
        Product.findById(productId).catch(() => null),
      ]);
      if (tx && tx.status === "success" && buyer && product) {
        const order2 = await buildStoreOrderFromVerifiedTx({
          tx,
          buyer,
          product,
          quantity: metadata.quantity || 1,
          deliveryMethod: metadata.deliveryMethod === "delivery" ? "delivery" : "pickup",
          deliveryNote: metadata.note || "",
          deliveryZone: metadata.deliveryZone === "outside" ? "outside" : "ile_ife",
          deliveryLocation: (metadata.deliveryLocation || "").toString().slice(0, 200),
          deliveryPhone: (metadata.deliveryPhone || "").toString().slice(0, 30),
        });
        return { handled: true, action: "store_order_created_from_webhook" };
      }
    }
    return { handled: false };
  }

  return { handled: false };
};

// ============================================================
// Buyer: my Oktober Fest orders
// ============================================================
exports.getMyStoreOrders = async (req, res) => {
  try {
    const orders = await StoreOrder.find({ buyerId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (err) {
    console.error("❌ oktoberFest getMyStoreOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Buyer: confirm receipt -> order completed
// ============================================================
exports.confirmStoreReceipt = async (req, res) => {
  const { id } = req.params;
  try {
    const order = await StoreOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (String(order.buyerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!["processing", "ready_for_pickup", "out_for_delivery", "delivered"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Items can only be confirmed once the payment is verified",
      });
    }
    if (order.buyerConfirmed) {
      return res.status(200).json({ success: true, message: "Already confirmed", order });
    }

    const now = new Date();
    pushHistory(order, "completed", { note: "Buyer confirmed they received the item", by: "buyer", at: now });
    const updated = await StoreOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          buyerConfirmed: true,
          buyerConfirmedAt: now,
          deliveredAt: now,
          orderStatus: "completed",
          deliveryStatus: "delivered",
          statusHistory: order.statusHistory,
        },
      },
      { new: true }
    );

    notify(
      PLATFORM_SUPPORT_EMAIL,
      "✅ Oktober Fest order completed — #" + order.orderNumber,
      `<p>Order <strong>${order.orderNumber}</strong> was confirmed received by the buyer.</p>`
    );

    res.status(200).json({ success: true, message: "Delivery confirmed. Thank you!", order: updated });
  } catch (err) {
    console.error("❌ oktoberFest confirmStoreReceipt error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Admin: campaign configuration
// ============================================================
function normalizeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ============================================================
// Fulfilment tracking helpers
// ============================================================
const TRACKING_LABELS = {
  pending_payment: "Payment sent",
  payment_received: "Payment received by Campus Crave",
  processing: "Order confirmed — being processed",
  ready_for_pickup: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  goods_given: "Goods handed over to buyer",
  delivered: "Delivered successfully",
  completed: "Order completed",
  cancelled: "Order cancelled",
  refunded: "Payment refunded",
};

/** Append one entry to the order's audit trail. */
function pushHistory(order, status, { note = "", by = "system", at = new Date() } = {}) {
  order.statusHistory = order.statusHistory || [];
  const label = TRACKING_LABELS[status] || String(status).replace(/_/g, " ");
  // Guard against duplicate entries when a webhook retries.
  const last = order.statusHistory[order.statusHistory.length - 1];
  if (last && last.status === status) {
    if (note) last.note = note;
    return order;
  }
  order.statusHistory.push({ status, label, note, by, at });
  return order;
}

/** Best-effort WhatsApp contact for a buyer (delivery phone first, then profile). */
function buyerContact(order) {
  return String(order.buyerWhatsapp || order.buyerPhone || "").replace(/[^\d]/g, "");
}

/**
 * Prefilled admin->buyer WhatsApp enquiry. Asks where the buyer wants the item,
 * and states exactly which item/payment we are talking about.
 */
function buildBuyerEnquiry(order, intent = "confirm") {
  const item = `${order.productSnapshot?.name || "your item"} x${order.quantity}`;
  const ref = order.orderNumber;
  const headers = {
    confirm:
      `Hello ${order.buyerName || "there"}, this is Campus Crave Store confirming your payment.`,
    pickup:
      `Hello ${order.buyerName || "there"}, your order from Campus Crave Store is ready.`,
    delivered:
      `Hello ${order.buyerName || "there"}, your Campus Crave Store order has been handed over.`,
  };
  const bodies = {
    confirm: `We have confirmed your payment for *${item}*.\nWhere will you be willing to receive it?`,
    pickup: `Your item *${item}* is ready for pickup at Campus Crave. Please let us know a convenient time.`,
    delivered: `We have delivered *${item}*. Please confirm on your dashboard that you received it.`,
  };
  return `${headers[intent] || headers.confirm}\n━━━━━━━━━━━━━━━━━━\n📦 *Item:* ${item}\n🧾 *Order:* #${ref}\n💰 *Paid:* ₦${Number(order.totalPaid || 0).toLocaleString()}\n━━━━━━━━━━━━━━━━━━\n\n${bodies[intent] || bodies.confirm}\n\nThank you!`;
}

/**
 * Stage-specific proactive update the admin sends to the buyer at each of the
 * three fulfilment stages. Unlike buildBuyerEnquiry (which asks a question),
 * these tell the buyer where their item is and point them at Track my order.
 */
const NOTIFY_MESSAGES = {
  processing: (item, ref) =>
    `Good news! We have started processing your order *${item}* (#${ref}). 📦\nYour item is being packed now.\n\nYou can follow every step from your CampusCrave dashboard → Track my order.`,
  ready: (item, ref) =>
    `Your order *${item}* (#${ref}) is ready! 🎉\nPlease come and pick it up at ___, or let us know if you would like it delivered and where.\n\nTrack the progress from your dashboard → Track my order.`,
  out_for_delivery: (item, ref) =>
    `Your order *${item}* (#${ref}) is on the way! 🚚\nIt has left us and is heading to you. Please stay reachable at your saved contact.\n\nTrack the progress from your dashboard → Track my order.`,
  goods_given: (item, ref) =>
    `Your order *${item}* (#${ref}) has been handed over to you. 🤝\nPlease confirm you received it on your dashboard → Track my order.`,
  delivered: (item, ref) =>
    `Your order *${item}* (#${ref}) has been delivered. ✅\nPlease confirm you received it on your dashboard → Track my order.\nThank you for shopping with Campus Crave!`,
};

/**
 * Which announcement fits a fulfilment action, so pressing a status button
 * produces the right wording instead of a generic template.
 */
const ACTION_NOTIFY_STAGE = {
  ready_for_pickup: "ready",
  out_for_delivery: "out_for_delivery",
  goods_given: "goods_given",
  delivered: "delivered",
};

function buildStageNotification(order, stage) {
  const item = `${order.productSnapshot?.name || "your item"} x${order.quantity}`;
  const header = `Hello ${order.buyerName || "there"}, here is an update on your Campus Crave order.`;
  const body = (NOTIFY_MESSAGES[stage] || NOTIFY_MESSAGES.processing)(item, order.orderNumber);
  return `${header}\n━━━━━━━━━━━━━━━━━━\n📦 *Item:* ${item}\n🧾 *Order:* #${order.orderNumber}\n━━━━━━━━━━━━━━━━━━\n\n${body}`;
}

exports.adminGetConfig = async (req, res) => {
  try {
    const config = await getCampaignSetting();
    const products = await Product.find({
      type: { $in: ["admin-gadget", "admin-food"] },
      "oktoberFest.enabled": true,
    }).sort({ postedAt: -1 });

    const orders = await StoreOrder.find({ saleFlag: "oktober" }).sort({ createdAt: -1 });

    const rows = products.map((p) => {
      const os = p.oktoberFest || {};
      return {
        _id: p._id,
        name: p.name,
        description: p.description || "",
        category: p.category,
        type: p.type,
        maxDeliveryDays: Number(p.maxDeliveryDays) > 0 ? Number(p.maxDeliveryDays) : null,
        image: (p.mainImage && p.mainImage.url) || (p.images && p.images[0] && p.images[0].url) || "",
        originalPrice: Number(os.originalPrice) || Number(p.price) || 0,
        salePrice: Number(os.salePrice) || 0,
        discountPercent: discountPercentOf(os),
        stock: Number(os.stock) || 0,
        soldCount: Number(os.soldCount) || 0,
        remaining: remainingStock(p),
        enabled: productSaleActive(p, config),
        startDate: os.startDate || null,
        endDate: os.endDate || null,
        productPrice: Number(p.price) || 0,
      };
    });

    const totalPaid = orders.reduce((sum, o) => sum + (o.paymentStatus === "verified" ? Number(o.totalPaid) || 0 : 0), 0);
    const soldUnits = products.reduce((sum, p) => sum + (Number(p.oktoberFest.soldCount) || 0), 0);
    const remainingUnits = products.reduce((sum, p) => sum + remainingStock(p), 0);

    res.status(200).json({
      success: true,
      campaign: config,
      active: campaignLive(config),
      products: rows,
      orders,
      summary: {
        saleProducts: rows.length,
        totalOrders: orders.length,
        verifiedOrders: orders.filter((o) => o.paymentStatus === "verified").length,
        totalSales: Math.round(totalPaid),
        productsSold: soldUnits,
        productsRemaining: remainingUnits,
      },
    });
  } catch (err) {
    console.error("❌ oktoberFest adminGetConfig error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.adminUpdateConfig = async (req, res) => {
  const { active, startDate, endDate, heroTitle, heroTagline } = req.body;
  try {
    const value = {
      active: !!active,
      startDate: normalizeDate(startDate),
      endDate: normalizeDate(endDate),
      heroTitle: String(heroTitle || "Campus Crave Oktober Fest").slice(0, 120),
      heroTagline: String(heroTagline || "Massive Discounts. Limited Deals. Don't Miss Out.").slice(0, 200),
    };
    await Setting.findOneAndUpdate({ key: CAMPAIGN_SETTING_KEY }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
    res.status(200).json({ success: true, campaign: value });
  } catch (err) {
    console.error("❌ oktoberFest adminUpdateConfig error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Admin: product-level Oktober Fest configuration
// ============================================================
function validateSalePrices(originalPrice, salePrice) {
  const original = Number(originalPrice);
  const sale = Number(salePrice);
  if (!(original > 0 && sale > 0)) {
    return { error: "Original price and sale price must both be greater than 0" };
  }
  if (!(sale < original)) {
    return { error: "Sale price must be less than the original price" };
  }
  return { original, sale };
}

/**
 * The optional "max days of delivery" promise on a deal.
 *
 * - `undefined`      → the admin did not touch the field; leave it untouched.
 * - `""` / `null`    → the admin cleared it; store `null` so the storefront hides it.
 * - `"8"` / `8`      → validated whole number between 1 and 365.
 */
function normalizeMaxDeliveryDays(input) {
  if (input === undefined) return { provided: false };
  if (input === null || input === "") return { provided: true, value: null };
  const days = Number(input);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1 || days > 365) {
    return { provided: true, error: "Max days of delivery must be a whole number between 1 and 365" };
  }
  return { provided: true, value: days };
}

exports.adminSetProductSale = async (req, res) => {
  const { id } = req.params;
  const { enabled, originalPrice, salePrice, stock, startDate, endDate, name, description, category, maxDeliveryDays } = req.body;
  try {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ success: false, message: "Invalid product" });
    }
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    if (product.type !== "admin-gadget" && product.type !== "admin-food") {
      return res.status(400).json({ success: false, message: "Only official Campus Crave Store products can join the Oktober Fest" });
    }

    // Editable copy fields. Validated so a bad edit fails loudly instead of
    // silently saving and telling the admin the deal was updated.
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Product name cannot be empty" });
    }

    const os = product.oktoberFest || {};
    const willEnable = enabled === undefined ? os.enabled : !!enabled;
    const newOriginal = originalPrice === undefined ? os.originalPrice : originalPrice;
    const newSale = salePrice === undefined ? os.salePrice : salePrice;
    const newStock = Math.max(0, Number(stock === undefined ? os.stock : stock) || 0);

    if (willEnable) {
      const checked = validateSalePrices(newOriginal, newSale);
      if (checked.error) {
        return res.status(400).json({ success: false, message: checked.error });
      }
    }

    const patch = {
      "oktoberFest.enabled": willEnable,
      "oktoberFest.originalPrice": Number(newOriginal) || 0,
      "oktoberFest.salePrice": Number(newSale) || 0,
      "oktoberFest.stock": newStock,
      "oktoberFest.startDate": normalizeDate(startDate === undefined ? os.startDate : startDate),
      "oktoberFest.endDate": normalizeDate(endDate === undefined ? os.endDate : endDate),
    };
    if (!willEnable) {
      // Leaving the sale keeps prices/stock for re-entry but stops selling NOW.
      patch["oktoberFest.enabled"] = false;
    }

    // Persist the editable copy fields alongside the sale settings.
    if (name !== undefined) patch.name = String(name).trim().slice(0, 120);
    if (category !== undefined && String(category).trim()) patch.category = String(category).trim().slice(0, 60);
    if (description !== undefined && String(description).trim()) {
      patch.description = String(description).trim().slice(0, 300);
    }

    // Optional lead-time promise: only touched when the admin sent the field,
    // and an empty value clears it so the storefront stops advertising it.
    const delivery = normalizeMaxDeliveryDays(maxDeliveryDays);
    if (delivery.error) {
      return res.status(400).json({ success: false, message: delivery.error });
    }
    if (delivery.provided) patch.maxDeliveryDays = delivery.value;

    const updated = await Product.findByIdAndUpdate(id, { $set: patch }, { new: true });
    res.status(200).json({ success: true, product: updated });
  } catch (err) {
    console.error("❌ oktoberFest adminSetProductSale error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.adminRemoveFromSale = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findByIdAndUpdate(id, { $set: { "oktoberFest.enabled": false } }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, product });
  } catch (err) {
    console.error("❌ oktoberFest adminRemoveFromSale error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================================================
// Admin: create an Oktober Fest product directly (image + pricing + stock)
// ============================================================
exports.adminCreateSaleProduct = async (req, res) => {
  const {
    name,
    description,
    fullDescription,
    category,
    image,
    images,
    type = "admin-gadget",
    originalPrice,
    salePrice,
    stock,
    startDate,
    endDate,
    maxDeliveryDays,
  } = req.body;
  try {
    const checked = validateSalePrices(originalPrice, salePrice);
    if (checked.error) return res.status(400).json({ success: false, message: checked.error });

    const delivery = normalizeMaxDeliveryDays(maxDeliveryDays);
    if (delivery.error) return res.status(400).json({ success: false, message: delivery.error });

    let mainImage = {};
    if (image && typeof image === "string") {
      let imageData = image;
      if (!imageData.startsWith("data:image")) imageData = `data:image/png;base64,${imageData}`;
      const upload = await require("../config/cloudinary").uploader.upload(imageData, { folder: "oktober_fest" });
      mainImage = { url: upload.secure_url, public_id: upload.public_id };
    }
    if (!mainImage.url || !mainImage.public_id) {
      return res.status(400).json({ success: false, message: "A valid product image is required" });
    }

    let gallery = [];
    if (Array.isArray(images) && images.length) {
      const uploadable = images
        .filter((img) => typeof img === "string" && img.trim())
        .slice(0, 2);
      if (uploadable.length) {
        const results = await Promise.all(
          uploadable.map((img) => {
            let imgData = img;
            if (!imgData.startsWith("data:image")) imgData = `data:image/png;base64,${imgData}`;
            return require("../config/cloudinary").uploader.upload(imgData, { folder: "oktober_fest" });
          })
        );
        gallery = results.map((r) => ({ url: r.secure_url, public_id: r.public_id }));
      }
    }

    const admin = await require("../Models/User").findById(req.user.id);

    const product = await Product.create({
      name,
      price: checked.original,
      description,
      fullDescription: fullDescription || description || name,
      mainImage,
      images: gallery.length ? [mainImage, ...gallery] : [],
      category: category || "Electronics",
      availability: "In Stock",
      type,
      sellerName: admin.name,
      sellerWhatsApp: admin.whatsapp,
      sellerImage: admin.profilePhoto?.url,
      sellerId: admin._id,
      school_name: admin.school_name,
      location_city: admin.location_city,
      isManaged: true,
      ownerName: "CampusCrave Official Store",
      ...(delivery.provided ? { maxDeliveryDays: delivery.value } : {}),
      oktoberFest: {
        enabled: true,
        originalPrice: checked.original,
        salePrice: checked.sale,
        stock: Math.max(0, Number(stock) || 0),
        soldCount: 0,
        startDate: normalizeDate(startDate),
        endDate: normalizeDate(endDate),
      },
    });

    res.status(201).json({ success: true, product });
  } catch (err) {
    console.error("❌ oktoberFest adminCreateSaleProduct error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ============================================================
// Admin: orders management
// ============================================================
exports.adminGetOrders = async (req, res) => {
  try {
    const { status, q, page = 1, limit = 50 } = req.query;
    const query = { saleFlag: "oktober" };
    if (status && status !== "all") query.orderStatus = status;
    if (q) query.$or = [{ orderNumber: { $regex: q, $options: "i" } }, { buyerEmail: { $regex: q, $options: "i" } }, { buyerName: { $regex: q, $options: "i" } }, { "productSnapshot.name": { $regex: q, $options: "i" } }];
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const [orders, total] = await Promise.all([
      StoreOrder.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
      StoreOrder.countDocuments(query),
    ]);
    res.status(200).json({ success: true, orders, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("❌ oktoberFest adminGetOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.adminGetOrderEnquiry = async (req, res) => {
  const { id } = req.params;
  const { intent = "confirm" } = req.query;
  try {
    const order = await StoreOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const contact = buyerContact(order);
    const message = buildBuyerEnquiry(order, intent);
    res.status(200).json({
      success: true,
      buyerContact: contact,
      buyerName: order.buyerName || "",
      message,
      whatsappLink: contact ? `https://wa.me/${contact}?text=${encodeURIComponent(message)}` : null,
    });
  } catch (err) {
    console.error("❌ oktoberFest adminGetOrderEnquiry error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Proactively notify the buyer about a fulfilment stage (processing / ready /
 * delivered). Records the ping in adminNotifications and returns a prefilled
 * WhatsApp link. Does NOT change orderStatus — the admin still presses the
 * separate status buttons to move the order along.
 */
exports.adminNotifyBuyerStage = async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  try {
    const allowed = ["processing", "ready", "delivered"];
    if (!allowed.includes(stage)) {
      return res.status(400).json({ success: false, message: `Unknown stage "${stage}"` });
    }
    const order = await StoreOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const contact = buyerContact(order);
    if (!contact) {
      return res.status(400).json({ success: false, message: "This buyer has no WhatsApp number on file" });
    }

    const message = buildStageNotification(order, stage);
    const by = (req.user && (req.user.name || req.user.email)) || "Campus Crave";

    // The same update is kept on the order so the buyer's Track my order page
    // shows it in-app, not only over WhatsApp/email.
    order.adminNotifications = order.adminNotifications || [];
    order.adminNotifications.push({ stage, by, message, at: new Date() });
    await StoreOrder.findByIdAndUpdate(id, { $set: { adminNotifications: order.adminNotifications } });

    notify(
      order.buyerEmail,
      `Update on your Campus Crave order #${order.orderNumber}`,
      `<p>Hello ${order.buyerName || "there"},</p>
       <p>${message.replace(/\n+/g, " ").replace(/\*/g, "")}</p>
       <p>Track it any time from your dashboard &rarr; Track my order.</p>
       <p>Best regards,<br/>CampusCrave Team</p>`
    );

    res.status(200).json({
      success: true,
      message,
      whatsappLink: `https://wa.me/${contact}?text=${encodeURIComponent(message)}`,
      buyerContact: contact,
    });
  } catch (err) {
    console.error("❌ oktoberFest adminNotifyBuyerStage error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Permanently remove a settled order.
 *
 * Deleting removes the row, so every admin total that is summed from
 * `StoreOrder` (total revenue, total orders, verified orders, per-day revenue)
 * stops counting it immediately — nothing is cached or denormalised.
 *
 * Stock is deliberately NOT returned by default: a completed order usually
 * means the item physically changed hands, and silently re-adding it could
 * oversell. Admins can opt in per deletion with `restock: true`.
 */
exports.adminDeleteOrder = async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ success: false, message: "Invalid order" });
    }
    const order = await StoreOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Only settled orders may be removed, so live work can never be lost by
    // a misclick. Buyers still relying on an open order keep their timeline.
    const settled = ["completed", "buyer_confirmed", "cancelled", "refunded"];
    if (!settled.includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Only completed or cancelled orders can be deleted",
      });
    }

    const restock = req.body?.restock === true || req.body?.restock === "true";
    let restocked = 0;
    if (restock && order.productId) {
      const result = await Product.findByIdAndUpdate(order.productId, {
        $inc: {
          "oktoberFest.soldCount": -Math.max(1, Number(order.quantity) || 1),
        },
      });
      // Clamp so a double-delete can never drive soldCount negative.
      if (result) {
        const sold = Math.max(0, Number(result.oktoberFest?.soldCount) || 0);
        if (sold !== Number(result.oktoberFest?.soldCount)) {
          await Product.findByIdAndUpdate(order.productId, {
            $set: { "oktoberFest.soldCount": sold },
          });
        }
        restocked = Math.max(1, Number(order.quantity) || 1);
      }
    }

    await StoreOrder.findByIdAndDelete(id);

    notify(
      PLATFORM_SUPPORT_EMAIL,
      "🗑️ Oktober Fest order deleted — #" + order.orderNumber,
      `<p>Admin permanently deleted order <strong>#${order.orderNumber}</strong>.</p>
       <p>Item: ${order.productSnapshot?.name || "unknown"} × ${order.quantity}</p>
       <p>Value: ₦${Number(order.totalPaid) || 0} · Stock returned: ${restocked ? "yes" : "no"}</p>`
    );

    res.status(200).json({
      success: true,
      message: `Order #${order.orderNumber} deleted`,
      restocked,
      removedValue: Number(order.totalPaid) || 0,
    });
  } catch (err) {
    console.error("❌ oktoberFest adminDeleteOrder error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.adminUpdateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  try {
    const order = await StoreOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const { note, handedOver } = req.body;

    const allowed = {
      processing: ["ready_for_pickup", "out_for_delivery", "delivered", "goods_given"],
      ready_for_pickup: ["out_for_delivery", "delivered", "goods_given"],
      out_for_delivery: ["delivered", "goods_given"],
    };
    const next = allowed[order.orderStatus] || [];
    if (!next.includes(action)) {
      return res.status(400).json({ success: false, message: `Cannot move from ${order.orderStatus} to ${action}` });
    }

    // "goods_given" is an admin-only attestation that the item physically
    // changed hands. It records the handover without forcing the order
    // straight to Delivered, so the buyer still confirms receipt themselves.
    const isGoodsGiven = action === "goods_given";
    const now = new Date();
    const noteText = typeof note === "string" ? note.trim().slice(0, 300) : "";

    if (isGoodsGiven) {
      order.goodsGiven = true;
      order.goodsGivenAt = now;
      order.goodsGivenBy = (req.user && (req.user.name || req.user.email)) || "Campus Crave";
    }

    pushHistory(
      order,
      isGoodsGiven ? "goods_given" : action,
      {
        note: noteText || (isGoodsGiven ? "Admin confirmed the goods were given to the buyer" : ""),
        by: "admin",
        at: now,
      }
    );

    const set = {
      statusHistory: order.statusHistory,
      goodsGiven: order.goodsGiven,
      goodsGivenAt: order.goodsGivenAt,
      goodsGivenBy: order.goodsGivenBy,
    };

    if (!isGoodsGiven) {
      set.orderStatus = action;
      set.deliveryStatus = action;
      if (action === "delivered") {
        set.deliveredAt = now;
        // Pressing Delivered also attests the handover.
        set.goodsGiven = true;
        set.goodsGivenAt = order.goodsGivenAt || now;
        set.goodsGivenBy = order.goodsGivenBy || (req.user && (req.user.name || req.user.email)) || "Campus Crave";
      }
    }

    const updated = await StoreOrder.findByIdAndUpdate(id, { $set: set }, { new: true });

    notify(
      order.buyerEmail,
      "Your Campus Crave Oktober Fest order status has changed",
      `<p>Hello ${order.buyerName || "there"},</p>
       <p>Order <strong>${order.orderNumber}</strong> is now: <strong>${TRACKING_LABELS[isGoodsGiven ? "goods_given" : action] || action.replace(/_/g, " ")}</strong>.</p>
       ${noteText ? `<p>Note from Campus Crave: ${noteText}</p>` : ""}
       <p>Track it any time from your CampusCrave dashboard &rarr; Track my order.</p>
       <p>Best regards,<br/>CampusCrave Team</p>`
    );

    // Hand the admin a ready-to-open WhatsApp link so they can confirm details
    // with the buyer (e.g. where to receive it) in one click.
    const contact = buyerContact(order);

    // Pressing a status button is also an announcement, so the same update is
    // recorded for the buyer's Track my order page instead of only WhatsApp.
    const stage = ACTION_NOTIFY_STAGE[action];
    const announcement = stage ? buildStageNotification(updated || order, stage) : "";
    if (announcement) {
      updated.adminNotifications = [...(updated.adminNotifications || []), {
        stage,
        by: (req.user && (req.user.name || req.user.email)) || "Campus Crave",
        message: announcement,
        at: now,
      }];
      await StoreOrder.findByIdAndUpdate(id, { $set: { adminNotifications: updated.adminNotifications } });
    }

    res.status(200).json({
      success: true,
      order: updated,
      buyerContact: contact,
      // The prefilled text, returned separately so the admin sees the exact
      // message before choosing to open WhatsApp.
      message: announcement,
      whatsappLink: contact
        ? `https://wa.me/${contact}?text=${encodeURIComponent(announcement)}`
        : null,
    });
  } catch (err) {
    console.error("❌ oktoberFest adminUpdateOrderStatus error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};