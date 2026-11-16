const Partner = require("../Models/Partner");
const PartnerProduct = require("../Models/PartnerProduct");
const PartnerCampaign = require("../Models/PartnerCampaign");
const PartnerClick = require("../Models/PartnerClick");
const PartnerConversion = require("../Models/PartnerConversion");
const { isObjectId, escapeRegex, isHttpsUrl } = require("../utils/security");
const { text } = require("../utils/listings");
const { PARTNER_MODES } = require("../services/partners/constants");
const {
  getPartnerMode,
  setPartnerMode,
  listPartnersWithStatus,
} = require("../services/partners/settings");
const { getAdapter, liveIntegrationStatus } = require("../services/partners/adapters");
const { isAllowedPartnerUrl } = require("../services/partners/urls");
const { recordConversion } = require("../services/partners/conversions");
const cloudinary = require("../config/cloudinary");
const { normalizeImagePayload } = require("../utils/images");

const PARTNER_KEYS = ["jumia", "temu"];
const PRODUCT_SOURCES = ["demo", "live"];
const PRICE_SOURCES = ["demo", "partner_api", "partner_feed", "manual_admin"];
const AVAILABILITY = ["in_stock", "out_of_stock", "unknown"];
const PRODUCT_STATUS = ["draft", "published", "unpublished"];
const CAMPAIGN_STATUS = ["draft", "active", "paused", "ended"];

function toAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return number;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeCurrency(value) {
  if (value === undefined) return undefined;
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function normalizeUrl(value, partner) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return "";
  if (isAllowedPartnerUrl(partner, value)) return String(value).trim();
  return null;
}

function normalizeImageUrl(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return "";
  return isHttpsUrl(value) ? String(value).trim() : null;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => text(tag, 50))
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeGallery(value) {
  if (!Array.isArray(value)) return [];
  const gallery = [];
  for (const entry of value.slice(0, 8)) {
    if (isHttpsUrl(entry)) gallery.push(String(entry).trim());
  }
  return gallery;
}

// Builds an allowlisted product payload. Returns validation errors instead of
// throwing so bulk imports can report per-row problems.
function prepareProductPayload(body, existing = null) {
  const errors = [];
  const data = {};

  const partner = String(body.partner ?? existing?.partner ?? "").toLowerCase();
  if (!PARTNER_KEYS.includes(partner)) {
    errors.push("partner must be jumia or temu");
  }

  const source = String(body.source ?? existing?.source ?? "demo");
  if (!PRODUCT_SOURCES.includes(source)) errors.push("source must be demo or live");

  if (body.externalId !== undefined || !existing) {
    const externalId = text(body.externalId, 200);
    if (!externalId) errors.push("externalId is required");
    else data.externalId = externalId;
  }

  if (body.title !== undefined || !existing) {
    const title = text(body.title, 200);
    if (!title) errors.push("title is required");
    else data.title = title;
  }

  if (body.category !== undefined || !existing) {
    const category = text(body.category, 100);
    if (!category) errors.push("category is required");
    else data.category = category;
  }

  if (body.description !== undefined) {
    data.description = body.description === null ? "" : text(body.description, 5000) || "";
  }

  if (body.tags !== undefined) data.tags = normalizeTags(body.tags);

  if (body.currency !== undefined) {
    const currency = normalizeCurrency(body.currency);
    if (!currency) errors.push("currency must be a 3-letter code");
    else data.currency = currency;
  }

  if (body.imageUrl !== undefined) {
    const imageUrl = normalizeImageUrl(body.imageUrl);
    if (imageUrl === null) errors.push("imageUrl must be an https URL");
    else data.imageUrl = imageUrl;
  }

  if (body.images !== undefined) data.images = normalizeGallery(body.images);

  if (body.productUrl !== undefined) {
    const productUrl = normalizeUrl(body.productUrl, partner);
    if (productUrl === null) errors.push(`productUrl must be an approved ${partner} link`);
    else data.productUrl = productUrl;
  }

  if (body.affiliateUrl !== undefined) {
    const affiliateUrl = normalizeUrl(body.affiliateUrl, partner);
    if (affiliateUrl === null) errors.push(`affiliateUrl must be an approved ${partner} link`);
    else data.affiliateUrl = affiliateUrl;
  }

  if (body.featured !== undefined) {
    data.featured = body.featured === true || body.featured === "true";
  }

  if (body.status !== undefined) {
    if (!PRODUCT_STATUS.includes(body.status)) errors.push("status must be draft, published or unpublished");
    else data.status = body.status;
  }

  if (body.campaignId !== undefined) {
    if (body.campaignId === null || body.campaignId === "") data.campaignId = null;
    else if (!isObjectId(body.campaignId)) errors.push("campaignId is invalid");
    else data.campaignId = body.campaignId;
  }

  let price = existing ? existing.price : null;
  if (body.price !== undefined) {
    const parsed = toAmount(body.price);
    if (parsed === undefined) errors.push("price must be a non-negative number");
    else price = parsed;
  }
  let originalPrice = existing ? existing.originalPrice : null;
  if (body.originalPrice !== undefined) {
    const parsed = toAmount(body.originalPrice);
    if (parsed === undefined) errors.push("originalPrice must be a non-negative number");
    else originalPrice = parsed;
  }

  if (source === "demo") {
    // Demo entries never carry invented price/availability figures.
    if (body.price !== undefined && body.price !== null && body.price !== "") {
      errors.push("Demo products cannot carry a price");
    }
    if (body.originalPrice !== undefined && body.originalPrice !== null && body.originalPrice !== "") {
      errors.push("Demo products cannot carry an original price");
    }
    data.price = null;
    data.originalPrice = null;
    data.availability = "unknown";
    data.priceSource = "demo";
    data.priceVerifiedAt = null;
  } else {
    if (body.price !== undefined) data.price = price;
    if (body.originalPrice !== undefined) data.originalPrice = originalPrice;

    if (body.availability !== undefined) {
      if (!AVAILABILITY.includes(body.availability) || body.availability === "unknown") {
        errors.push("Live products need a verified availability (in_stock or out_of_stock)");
      }
      data.availability = body.availability;
    }

    if (body.priceSource !== undefined) {
      if (!PRICE_SOURCES.includes(body.priceSource) || body.priceSource === "demo") {
        errors.push("priceSource must be partner_api, partner_feed or manual_admin for live products");
      }
      data.priceSource = body.priceSource;
    } else if (body.price !== undefined && (existing?.priceSource || "demo") === "demo") {
      data.priceSource = "manual_admin";
    }

    if (body.priceVerifiedAt !== undefined) {
      const verifiedAt = toDate(body.priceVerifiedAt);
      if (verifiedAt === undefined) errors.push("priceVerifiedAt is invalid");
      else data.priceVerifiedAt = verifiedAt;
    } else if (body.price !== undefined && !existing?.priceVerifiedAt) {
      data.priceVerifiedAt = new Date();
    }

    const finalPrice = data.price !== undefined ? data.price : price;
    const finalOriginal = data.originalPrice !== undefined ? data.originalPrice : originalPrice;
    if (finalPrice !== null && finalOriginal !== null && finalOriginal < finalPrice) {
      errors.push("originalPrice cannot be lower than price");
    }
  }

  if (body.source !== undefined) data.source = source;

  return { errors, data, partner, source };
}

function publishRequirementError(product) {
  if (!PRODUCT_SOURCES.includes(product.source)) return "Invalid product source";
  if (!isAllowedPartnerUrl(product.partner, product.productUrl) &&
      !isAllowedPartnerUrl(product.partner, product.affiliateUrl)) {
    return "Publishing requires an approved partner page or affiliate link";
  }

  if (product.source === "demo") return null;

  if (product.price === null || product.price === undefined) {
    return "Live products must have a verified price before publishing";
  }
  if (!["in_stock", "out_of_stock"].includes(product.availability)) {
    return "Live products must have verified availability before publishing";
  }
  if (!product.priceVerifiedAt) {
    return "Live products must record when the price was verified";
  }
  if (!product.priceSource || product.priceSource === "demo") {
    return "Live products must record how the price was verified";
  }
  return null;
}

// ---------------- Settings ----------------

exports.getSettings = async (req, res) => {
  try {
    const mode = await getPartnerMode();
    const partners = await listPartnersWithStatus();

    res.status(200).json({
      success: true,
      mode,
      modes: PARTNER_MODES,
      partners: partners.map((partner) => ({
        ...partner,
        adapter: getAdapter(partner.key),
        live: liveIntegrationStatus(partner.key, partner.integrationStatus),
      })),
    });
  } catch (error) {
    console.error("Partner Settings Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load partner settings" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const mode = await setPartnerMode(req.body.mode, req.user.id);
    res.status(200).json({ success: true, mode });
  } catch (error) {
    if (error.code === "INVALID_MODE") {
      return res.status(400).json({ success: false, message: "Invalid partner mode" });
    }
    console.error("Partner Mode Update Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update partner mode" });
  }
};

exports.updatePartner = async (req, res) => {
  const key = String(req.params.key || "").toLowerCase();
  if (!PARTNER_KEYS.includes(key)) {
    return res.status(404).json({ success: false, message: "Unknown partner" });
  }

  const updates = {};
  if (req.body.integrationStatus !== undefined) {
    if (!["demo", "live"].includes(req.body.integrationStatus)) {
      return res.status(400).json({ success: false, message: "integrationStatus must be demo or live" });
    }
    updates.integrationStatus = req.body.integrationStatus;
  }
  if (req.body.affiliateProgramName !== undefined) {
    updates.affiliateProgramName = text(req.body.affiliateProgramName, 120) || "";
  }
  if (req.body.notes !== undefined) {
    updates.notes = text(req.body.notes, 1000) || "";
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: "No permitted fields to update" });
  }

  try {
    const registry = (await listPartnersWithStatus()).find((partner) => partner.key === key);
    const partner = await Partner.findOneAndUpdate(
      { key },
      {
        $set: { ...updates, updatedAt: new Date() },
        $setOnInsert: { name: registry?.name || key, websiteUrl: registry?.websiteUrl || "" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      partner: {
        key: partner.key,
        name: partner.name,
        integrationStatus: partner.integrationStatus,
        affiliateProgramName: partner.affiliateProgramName,
        notes: partner.notes,
      },
    });
  } catch (error) {
    console.error("Partner Update Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update partner" });
  }
};

// Uploads an admin-selected image to Cloudinary so partner products and
// campaign banners can use an https URL instead of a data URL.
exports.uploadPartnerImage = async (req, res) => {
  let payload;
  try {
    payload = normalizeImagePayload(req.body?.image);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Invalid image" });
  }

  try {
    const upload = await cloudinary.uploader.upload(payload, {
      folder: "partner-products",
      resource_type: "image",
    });
    return res.status(201).json({
      success: true,
      url: upload.secure_url,
      publicId: upload.public_id,
    });
  } catch (error) {
    console.error("Partner Upload Error:", error.message);
    return res.status(502).json({
      success: false,
      message: "Image upload failed. Check the Cloudinary configuration and try again.",
    });
  }
};

// ---------------- Products ----------------

exports.listProducts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.partner !== undefined && PARTNER_KEYS.includes(String(req.query.partner).toLowerCase())) {
      filter.partner = String(req.query.partner).toLowerCase();
    }
    if (req.query.status !== undefined && PRODUCT_STATUS.includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.source !== undefined && PRODUCT_SOURCES.includes(req.query.source)) {
      filter.source = req.query.source;
    }
    if (req.query.campaignId !== undefined && isObjectId(req.query.campaignId)) {
      filter.campaignId = req.query.campaignId;
    }
    if (req.query.q !== undefined) {
      const term = String(req.query.q).trim();
      if (term.length > 80) {
        return res.status(400).json({ success: false, message: "Search term is too long" });
      }
      if (term) {
        const regex = new RegExp(escapeRegex(term), "i");
        filter.$or = [{ title: regex }, { externalId: regex }];
      }
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

    const [products, total] = await Promise.all([
      PartnerProduct.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PartnerProduct.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      products,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Partner Admin Products Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load partner products" });
  }
};

async function validateCampaign(campaignId, partner) {
  if (!campaignId) return null;
  const campaign = await PartnerCampaign.findById(campaignId).lean();
  if (!campaign) return "Campaign not found";
  if (campaign.partner !== partner) return "Campaign belongs to a different partner";
  return null;
}

exports.createProduct = async (req, res) => {
  const { errors, data, partner, source } = prepareProductPayload(req.body);
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }

  const campaignError = await validateCampaign(data.campaignId, partner);
  if (campaignError) {
    return res.status(400).json({ success: false, message: campaignError });
  }

  if ((data.status || "draft") === "published") {
    const requirement = publishRequirementError({
      partner,
      source: data.source || source,
      productUrl: data.productUrl || "",
      affiliateUrl: data.affiliateUrl || "",
      price: data.price ?? null,
      availability: data.availability || "unknown",
      priceVerifiedAt: data.priceVerifiedAt || null,
      priceSource: data.priceSource || (source === "demo" ? "demo" : ""),
    });
    if (requirement) {
      return res.status(400).json({ success: false, message: requirement });
    }
  }

  try {
    const product = await PartnerProduct.create({
      ...data,
      partner,
      source: data.source || source,
      status: data.status || "draft",
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "This partner product already exists" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Invalid partner product data" });
    }
    console.error("Partner Product Create Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to create partner product" });
  }
};

exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const existing = await PartnerProduct.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Partner product not found" });
    }

    const { errors, data, partner, source } = prepareProductPayload(req.body, existing);
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    if (data.campaignId !== undefined) {
      const campaignError = await validateCampaign(data.campaignId, partner);
      if (campaignError) {
        return res.status(400).json({ success: false, message: campaignError });
      }
    }

    const merged = { ...existing.toObject(), ...data, partner, source: data.source || source };
    if (merged.status === "published") {
      const requirement = publishRequirementError(merged);
      if (requirement) {
        return res.status(400).json({ success: false, message: requirement });
      }
    }

    const product = await PartnerProduct.findByIdAndUpdate(
      id,
      { ...data, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, product });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "This partner product already exists" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Invalid partner product data" });
    }
    console.error("Partner Product Update Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update partner product" });
  }
};

async function setProductStatus(req, res, status) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const product = await PartnerProduct.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Partner product not found" });
    }

    if (status === "published") {
      const requirement = publishRequirementError(product.toObject());
      if (requirement) {
        return res.status(400).json({ success: false, message: requirement });
      }
    }

    product.status = status;
    product.updatedBy = req.user.id;
    await product.save();

    res.status(200).json({ success: true, product });
  } catch (error) {
    console.error("Partner Product Status Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update partner product status" });
  }
}

exports.publishProduct = (req, res) => setProductStatus(req, res, "published");
exports.unpublishProduct = (req, res) => setProductStatus(req, res, "unpublished");

exports.deleteProduct = async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const product = await PartnerProduct.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Partner product not found" });
    }
    res.status(200).json({ success: true, message: "Partner product deleted" });
  } catch (error) {
    console.error("Partner Product Delete Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to delete partner product" });
  }
};

exports.importProducts = async (req, res) => {
  const partner = String(req.body.partner || "").toLowerCase();
  if (!PARTNER_KEYS.includes(partner)) {
    return res.status(400).json({ success: false, message: "partner must be jumia or temu" });
  }

  const items = req.body.products;
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    return res.status(400).json({ success: false, message: "products must be an array of 1-500 items" });
  }

  const result = { created: 0, updated: 0, invalid: [] };

  for (let index = 0; index < items.length; index += 1) {
    const item = { ...items[index], partner, source: "live", priceSource: items[index]?.priceSource || "partner_feed" };
    const { errors, data } = prepareProductPayload(item);

    if (errors.length) {
      if (result.invalid.length < 20) result.invalid.push({ index, error: errors[0] });
      continue;
    }

    try {
      const existing = await PartnerProduct.findOne({
        partner,
        externalId: data.externalId,
      });

      if (existing) {
        await PartnerProduct.findByIdAndUpdate(
          existing._id,
          { ...data, source: "live", updatedBy: req.user.id },
          { runValidators: true }
        );
        result.updated += 1;
      } else {
        await PartnerProduct.create({
          ...data,
          partner,
          source: "live",
          status: "draft",
          createdBy: req.user.id,
          updatedBy: req.user.id,
        });
        result.created += 1;
      }
    } catch (error) {
      if (result.invalid.length < 20) {
        result.invalid.push({ index, error: error.code === 11000 ? "Duplicate product" : "Could not import row" });
      }
    }
  }

  res.status(200).json({ success: true, ...result });
};

// ---------------- Campaigns ----------------

exports.listCampaigns = async (req, res) => {
  try {
    const filter = {};
    if (req.query.partner !== undefined && PARTNER_KEYS.includes(String(req.query.partner).toLowerCase())) {
      filter.partner = String(req.query.partner).toLowerCase();
    }
    if (req.query.status !== undefined && CAMPAIGN_STATUS.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const campaigns = await PartnerCampaign.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, campaigns });
  } catch (error) {
    console.error("Partner Campaigns Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load campaigns" });
  }
};

function campaignPayload(body) {
  const errors = [];
  const data = {};

  if (body.partner !== undefined) {
    const partner = String(body.partner).toLowerCase();
    if (!PARTNER_KEYS.includes(partner)) errors.push("partner must be jumia or temu");
    else data.partner = partner;
  }
  if (body.name !== undefined) {
    const name = text(body.name, 150);
    if (!name) errors.push("name is required");
    else data.name = name;
  }
  if (body.description !== undefined) {
    data.description = body.description === null ? "" : text(body.description, 2000) || "";
  }
  if (body.status !== undefined) {
    if (!CAMPAIGN_STATUS.includes(body.status)) errors.push("Invalid campaign status");
    else data.status = body.status;
  }
  for (const field of ["startsAt", "endsAt"]) {
    if (body[field] !== undefined) {
      if (body[field] === null || body[field] === "") data[field] = null;
      else {
        const date = toDate(body[field]);
        if (date === undefined) errors.push(`${field} is invalid`);
        else data[field] = date;
      }
    }
  }

  if (body.bannerTitle !== undefined) {
    data.bannerTitle = body.bannerTitle === null ? "" : text(body.bannerTitle, 120) || "";
  }
  if (body.bannerSubtitle !== undefined) {
    data.bannerSubtitle = body.bannerSubtitle === null ? "" : text(body.bannerSubtitle, 240) || "";
  }
  if (body.bannerCtaLabel !== undefined) {
    data.bannerCtaLabel = body.bannerCtaLabel === null ? "" : text(body.bannerCtaLabel, 40) || "";
  }
  if (body.bannerImageUrl !== undefined) {
    const bannerImageUrl = normalizeImageUrl(body.bannerImageUrl);
    if (bannerImageUrl === null) errors.push("bannerImageUrl must be an https URL");
    else data.bannerImageUrl = bannerImageUrl;
  }

  const start = data.startsAt;
  const end = data.endsAt;
  if (start && end && start > end) errors.push("startsAt cannot be after endsAt");

  return { errors, data };
}

exports.createCampaign = async (req, res) => {
  const { errors, data } = campaignPayload(req.body);
  if (!data.partner) errors.push("partner is required");
  if (!data.name) errors.push("name is required");
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }

  try {
    const campaign = await PartnerCampaign.create({
      ...data,
      status: data.status || "draft",
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });
    res.status(201).json({ success: true, campaign });
  } catch (error) {
    console.error("Create Campaign Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to create campaign" });
  }
};

exports.updateCampaign = async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid campaign ID" });
  }

  const { errors, data } = campaignPayload(req.body);
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors[0], errors });
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ success: false, message: "No permitted fields to update" });
  }

  try {
    const campaign = await PartnerCampaign.findByIdAndUpdate(
      id,
      { ...data, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }
    res.status(200).json({ success: true, campaign });
  } catch (error) {
    console.error("Update Campaign Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update campaign" });
  }
};

exports.deleteCampaign = async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid campaign ID" });
  }

  try {
    const campaign = await PartnerCampaign.findByIdAndDelete(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }
    await PartnerProduct.updateMany({ campaignId: id }, { $set: { campaignId: null } });
    res.status(200).json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    console.error("Delete Campaign Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to delete campaign" });
  }
};

// ---------------- Analytics ----------------

function dateRange(query) {
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = query.to ? new Date(query.to) : now;
  return {
    from: Number.isNaN(from.getTime()) ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : from,
    to: Number.isNaN(to.getTime()) ? now : to,
  };
}

exports.getAnalytics = async (req, res) => {
  try {
    const { from, to } = dateRange(req.query);
    const partnerFilter = PARTNER_KEYS.includes(String(req.query.partner || "").toLowerCase())
      ? String(req.query.partner).toLowerCase()
      : null;

    const clickMatch = { createdAt: { $gte: from, $lte: to } };
    const conversionMatch = { status: "confirmed", createdAt: { $gte: from, $lte: to } };
    if (partnerFilter) {
      clickMatch.partner = partnerFilter;
      conversionMatch.partner = partnerFilter;
    }

    const [
      clicksByPartner,
      topProducts,
      clicksByCampaign,
      conversionsByCampaign,
      conversionCounts,
      commissions,
      orderTotals,
      demoClicks,
    ] = await Promise.all([
      PartnerClick.aggregate([{ $match: clickMatch }, { $group: { _id: "$partner", clicks: { $sum: 1 } } }]),
      PartnerClick.aggregate([
        { $match: clickMatch },
        { $group: { _id: "$productId", clicks: { $sum: 1 }, demo: { $max: "$isDemo" } } },
        { $sort: { clicks: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "partnerproducts",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        {
          $project: {
            clicks: 1,
            demo: 1,
            productId: "$_id",
            title: { $ifNull: [{ $first: "$product.title" }, "Deleted partner product"] },
            partner: { $ifNull: [{ $first: "$product.partner" }, ""] },
            productSource: { $ifNull: [{ $first: "$product.source" }, ""] },
          },
        },
      ]),
      PartnerClick.aggregate([
        { $match: clickMatch },
        { $group: { _id: "$campaignId", clicks: { $sum: 1 } } },
      ]),
      PartnerConversion.aggregate([
        { $match: conversionMatch },
        { $group: { _id: "$campaignId", conversions: { $sum: 1 } } },
      ]),
      PartnerConversion.aggregate([
        {
          $match: {
            ...conversionMatch,
            status: { $in: ["confirmed", "rejected"] },
          },
        },
        { $group: { _id: { status: "$status", partner: "$partner" }, count: { $sum: 1 } } },
      ]),
      PartnerConversion.aggregate([
        { $match: { ...conversionMatch, commissionAmount: { $ne: null } } },
        {
          $group: {
            _id: "$commissionCurrency",
            amount: { $sum: "$commissionAmount" },
            records: { $sum: 1 },
          },
        },
        { $sort: { amount: -1 } },
      ]),
      PartnerConversion.aggregate([
        { $match: { ...conversionMatch, orderAmount: { $ne: null } } },
        {
          $group: {
            _id: "$currency",
            amount: { $sum: "$orderAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { amount: -1 } },
      ]),
      PartnerClick.countDocuments({ ...clickMatch, isDemo: true }),
    ]);

    const campaignIds = [
      ...new Set(
        [...clicksByCampaign, ...conversionsByCampaign]
          .map((row) => (row._id ? String(row._id) : null))
          .filter(Boolean)
      ),
    ];
    const campaigns = campaignIds.length
      ? await PartnerCampaign.find({ _id: { $in: campaignIds } }).select("name partner status").lean()
      : [];
    const campaignMap = {};
    for (const campaign of campaigns) campaignMap[String(campaign._id)] = campaign;

    const campaignStatsMap = {};
    for (const row of clicksByCampaign) {
      const key = row._id ? String(row._id) : "unassigned";
      campaignStatsMap[key] = campaignStatsMap[key] || { clicks: 0, conversions: 0 };
      campaignStatsMap[key].clicks = row.clicks;
    }
    for (const row of conversionsByCampaign) {
      const key = row._id ? String(row._id) : "unassigned";
      campaignStatsMap[key] = campaignStatsMap[key] || { clicks: 0, conversions: 0 };
      campaignStatsMap[key].conversions = row.conversions;
    }
    const campaignStats = Object.entries(campaignStatsMap).map(([key, stats]) => ({
      campaignId: key === "unassigned" ? null : key,
      name: key === "unassigned" ? "Unassigned" : campaignMap[key]?.name || "Deleted campaign",
      partner: key === "unassigned" ? null : campaignMap[key]?.partner || null,
      clicks: stats.clicks,
      confirmedConversions: stats.conversions,
    }));

    const totalClicks = clicksByPartner.reduce((sum, row) => sum + row.clicks, 0);
    const confirmed = conversionCounts.find((row) => row._id.status === "confirmed");
    const rejected = conversionCounts.find((row) => row._id.status === "rejected");

    const partners = await listPartnersWithStatus();

    res.status(200).json({
      success: true,
      range: { from, to },
      mode: await getPartnerMode(),
      partners,
      clicks: {
        total: totalClicks,
        demo: demoClicks,
        byPartner: PARTNER_KEYS.map((key) => ({
          partner: key,
          clicks: clicksByPartner.find((row) => row._id === key)?.clicks || 0,
        })),
      },
      topProducts,
      campaigns: campaignStats,
      conversions: {
        confirmed: confirmed ? confirmed.count : 0,
        rejected: rejected ? rejected.count : 0,
        byPartner: PARTNER_KEYS.map((key) => ({
          partner: key,
          confirmed: conversionCounts.find((row) => row._id.partner === key && row._id.status === "confirmed")?.count || 0,
        })),
        orderTotals,
        commissions,
      },
      note:
        "Conversions are recorded only from authorised partner APIs, webhooks or reports. Clicks are never counted as purchases.",
    });
  } catch (error) {
    console.error("Partner Analytics Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load partner analytics" });
  }
};

// ---------------- Conversions ----------------

exports.listConversions = async (req, res) => {
  try {
    const filter = {};
    if (req.query.partner !== undefined && PARTNER_KEYS.includes(String(req.query.partner).toLowerCase())) {
      filter.partner = String(req.query.partner).toLowerCase();
    }
    if (req.query.status !== undefined && ["confirmed", "rejected"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (
      req.query.source !== undefined &&
      PartnerConversion.CONVERSION_SOURCES.includes(req.query.source)
    ) {
      filter.source = req.query.source;
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

    const [conversions, total] = await Promise.all([
      PartnerConversion.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PartnerConversion.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      conversions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Partner Conversions Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load conversions" });
  }
};

exports.importConversions = async (req, res) => {
  const items = req.body.conversions;
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    return res.status(400).json({
      success: false,
      message: "conversions must be an array of 1-500 items",
    });
  }

  const summary = { imported: 0, duplicates: 0, invalid: [] };

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const partner = String(item.partner || "").toLowerCase();
    const externalOrderId = text(item.externalOrderId, 200);
    const status = item.status === "rejected" ? "rejected" : "confirmed";
    const source = ["partner_report", "manual_import"].includes(item.source)
      ? item.source
      : "manual_import";

    const error =
      (!PARTNER_KEYS.includes(partner) && "partner must be jumia or temu") ||
      (!externalOrderId && "externalOrderId is required") ||
      (item.orderAmount !== undefined && toAmount(item.orderAmount) === undefined &&
        "orderAmount must be a non-negative number") ||
      (item.commissionAmount !== undefined && toAmount(item.commissionAmount) === undefined &&
        "commissionAmount must be a non-negative number") ||
      (item.currency !== undefined && !normalizeCurrency(item.currency) && "currency is invalid") ||
      (item.commissionCurrency !== undefined &&
        !normalizeCurrency(item.commissionCurrency) &&
        "commissionCurrency is invalid") ||
      (item.confirmedAt !== undefined && toDate(item.confirmedAt) === undefined &&
        "confirmedAt is invalid");

    if (error) {
      if (summary.invalid.length < 20) summary.invalid.push({ index, error });
      continue;
    }

    try {
      const outcome = await recordConversion({
        partner,
        externalOrderId,
        status,
        source,
        clickId: typeof item.clickId === "string" && item.clickId.length <= 100 ? item.clickId : null,
        productExternalId:
          typeof item.productExternalId === "string" ? text(item.productExternalId, 200) : null,
        orderAmount: item.orderAmount !== undefined ? toAmount(item.orderAmount) : null,
        currency: normalizeCurrency(item.currency) || "NGN",
        commissionAmount:
          item.commissionAmount !== undefined ? toAmount(item.commissionAmount) : null,
        commissionCurrency:
          normalizeCurrency(item.commissionCurrency) || normalizeCurrency(item.currency) || "NGN",
        confirmedAt: item.confirmedAt !== undefined ? toDate(item.confirmedAt) : null,
        recordedBy: req.user.id,
      });

      if (outcome.created) summary.imported += 1;
      else summary.duplicates += 1;
    } catch (errorFromRecord) {
      if (summary.invalid.length < 20) summary.invalid.push({ index, error: "Could not import row" });
    }
  }

  res.status(200).json({ success: true, ...summary });
};
