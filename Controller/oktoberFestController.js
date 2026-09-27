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
    buyerAddress: deliveryLocation || "",
    productId: product._id,
    productSnapshot: {
      name: product.name,
      image: (product.mainImage && product.mainImage.url) || (product.images && product.images[0] && product.images[0].url) || "",
      category: product.category,
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

    res.status(201).json({ success: true, message: "Payment verified. Order created.", order });
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
    const updated = await StoreOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          buyerConfirmed: true,
          buyerConfirmedAt: now,
          deliveredAt: now,
          orderStatus: "completed",
          deliveryStatus: "delivered",
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
        category: p.category,
        type: p.type,
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

exports.adminSetProductSale = async (req, res) => {
  const { id } = req.params;
  const { enabled, originalPrice, salePrice, stock, startDate, endDate } = req.body;
  try {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ success: false, message: "Invalid product" });
    }
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    if (product.type !== "admin-gadget" && product.type !== "admin-food") {
      return res.status(400).json({ success: false, message: "Only official Campus Crave Store products can join the Oktober Fest" });
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
  } = req.body;
  try {
    const checked = validateSalePrices(originalPrice, salePrice);
    if (checked.error) return res.status(400).json({ success: false, message: checked.error });

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

exports.adminUpdateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  try {
    const order = await StoreOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const allowed = {
      processing: ["ready_for_pickup", "out_for_delivery", "delivered"],
      ready_for_pickup: ["out_for_delivery", "delivered"],
      out_for_delivery: ["delivered"],
    };
    const next = allowed[order.orderStatus] || [];
    if (!next.includes(action)) {
      return res.status(400).json({ success: false, message: `Cannot move from ${order.orderStatus} to ${action}` });
    }

    const updated = await StoreOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          orderStatus: action,
          deliveryStatus: action,
          deliveredAt: action === "delivered" ? new Date() : order.deliveredAt,
        },
      },
      { new: true }
    );

    notify(
      order.buyerEmail,
      "Your Campus Crave Oktober Fest order status has changed",
      `<p>Hello ${order.buyerName || "there"},</p>
       <p>Order <strong>${order.orderNumber}</strong> is now: <strong>${action.replace(/_/g, " ")}</strong>.</p>
       <p>Track it from your CampusCrave dashboard.</p>
       <p>Best regards,<br/>CampusCrave Team</p>`
    );

    res.status(200).json({ success: true, order: updated });
  } catch (err) {
    console.error("❌ oktoberFest adminUpdateOrderStatus error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};