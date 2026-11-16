const crypto = require("crypto");
const Partner = require("../Models/Partner");
const PartnerProduct = require("../Models/PartnerProduct");
const PartnerClick = require("../Models/PartnerClick");
const PartnerCampaign = require("../Models/PartnerCampaign");
const { isObjectId, escapeRegex, hashIp, parseHttpsUrl } = require("../utils/security");
const { getPartnerMode, listPartnersWithStatus } = require("../services/partners/settings");
const { partnersForMode } = require("../services/partners/registry");
const { isAllowedPartnerUrl, resolveProductDestination } = require("../services/partners/urls");

function publicBaseUrl(req) {
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "localhost")
    .split(",")[0]
    .trim();
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

async function livePartnerKeys(keys) {
  if (!keys.length) return [];
  const docs = await Partner.find({
    key: { $in: keys },
    integrationStatus: "live",
  })
    .select("key")
    .lean();
  return docs.map((doc) => doc.key);
}

// A product is visible only when its partner mode is on and, for live stock,
// that partner has been explicitly switched to live.
async function visibleProductsFilter(enabledKeys) {
  const liveKeys = await livePartnerKeys(enabledKeys);
  return {
    status: "published",
    partner: { $in: enabledKeys },
    $or: [{ source: "demo" }, ...(liveKeys.length ? [{ source: "live", partner: { $in: liveKeys } }] : [])],
  };
}

// Catalogue ordering. Demo entries carry no price, so price sorts keep them
// last instead of pretending a missing price is the cheapest item.
const SORT_OPTIONS = {
  featured: { featured: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  title_asc: { title: 1 },
  title_desc: { title: -1 },
  price_asc: { demoRank: 1, price: 1, featured: -1, createdAt: -1 },
  price_desc: { demoRank: 1, price: -1, featured: -1, createdAt: -1 },
};

function resolveSortKey(raw) {
  if (raw === undefined || raw === "") return "featured";
  const key = String(raw).trim().toLowerCase();
  return SORT_OPTIONS[key] ? key : null;
}

async function findProductPage(filter, sortKey, page, limit) {
  if (sortKey !== "price_asc" && sortKey !== "price_desc") {
    return PartnerProduct.find(filter)
      .sort(SORT_OPTIONS[sortKey])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
  }

  return PartnerProduct.aggregate([
    { $match: filter },
    {
      $addFields: {
        demoRank: { $cond: [{ $eq: ["$source", "demo"] }, 1, 0] },
      },
    },
    { $sort: SORT_OPTIONS[sortKey] },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ]);
}

function serializeProduct(product) {
  const isDemo = product.source === "demo";
  return {
    id: product._id,
    partner: product.partner,
    source: product.source,
    isDemo,
    demoLabel: isDemo ? "Demo listing — price and availability shown on the partner site" : null,
    externalId: product.externalId,
    title: product.title,
    description: product.description,
    category: product.category,
    tags: product.tags || [],
    imageUrl: product.imageUrl || "",
    images: product.images || [],
    currency: product.currency,
    price: isDemo ? null : product.price,
    originalPrice: isDemo ? null : product.originalPrice,
    availability: isDemo ? "unknown" : product.availability,
    priceVerifiedAt: isDemo ? null : product.priceVerifiedAt,
    priceSource: isDemo ? null : product.priceSource || null,
    featured: !!product.featured,
    campaignId: product.campaignId || null,
    clicks: product.clicks || 0,
  };
}

exports.getPartnerConfig = async (req, res) => {
  try {
    const mode = await getPartnerMode();
    const enabledKeys = partnersForMode(mode);
    const partners = await listPartnersWithStatus();

    const enabled = partners
      .filter((partner) => enabledKeys.includes(partner.key))
      .map((partner) => ({
        key: partner.key,
        name: partner.name,
        websiteUrl: partner.websiteUrl,
        integrationStatus: partner.integrationStatus,
        demoEnabled: true,
      }));

    res.status(200).json({
      success: true,
      mode,
      enabled: enabledKeys.length > 0,
      demoMode: enabled.some((partner) => partner.integrationStatus !== "live"),
      partners: enabled,
    });
  } catch (error) {
    console.error("Partner Config Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load partner configuration" });
  }
};

exports.getPartnerProducts = async (req, res) => {
  try {
    const sortKey = resolveSortKey(req.query.sort);
    if (!sortKey) {
      return res.status(400).json({ success: false, message: "Invalid sort option" });
    }

    const mode = await getPartnerMode();
    const enabledKeys = partnersForMode(mode);

    if (!enabledKeys.length) {
      return res.status(200).json({
        success: true,
        mode,
        enabled: false,
        products: [],
        categories: [],
        total: 0,
        page: 1,
        pages: 0,
      });
    }

    const filter = await visibleProductsFilter(enabledKeys);

    if (req.query.partner !== undefined) {
      const partner = String(req.query.partner).toLowerCase();
      if (!enabledKeys.includes(partner)) {
        return res.status(200).json({
          success: true,
          mode,
          enabled: true,
          products: [],
          categories: [],
          total: 0,
          page: 1,
          pages: 0,
        });
      }
      filter.partner = partner;
    }

    if (req.query.category !== undefined) {
      const category = String(req.query.category).trim();
      if (!category || category.length > 100) {
        return res.status(400).json({ success: false, message: "Invalid category filter" });
      }
      filter.category = category;
    }

    if (req.query.campaignId !== undefined && isObjectId(req.query.campaignId)) {
      filter.campaignId = req.query.campaignId;
    }

    if (req.query.featured === "true") {
      filter.featured = true;
    }

    if (req.query.q !== undefined) {
      const term = String(req.query.q).trim();
      if (term.length > 80) {
        return res.status(400).json({ success: false, message: "Search term is too long" });
      }
      if (term) {
        const regex = new RegExp(escapeRegex(term), "i");
        filter.title = regex;
      }
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

    const [products, total, categories] = await Promise.all([
      findProductPage(filter, sortKey, page, limit),
      PartnerProduct.countDocuments(filter),
      PartnerProduct.distinct("category", filter),
    ]);

    res.status(200).json({
      success: true,
      mode,
      enabled: true,
      products: products.map(serializeProduct),
      categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Partner Products Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load partner products" });
  }
};

exports.getPartnerProductById = async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const mode = await getPartnerMode();
    const enabledKeys = partnersForMode(mode);
    if (!enabledKeys.length) {
      return res.status(404).json({ success: false, message: "Partner products are not available" });
    }

    const filter = await visibleProductsFilter(enabledKeys);
    filter._id = id;

    const product = await PartnerProduct.findOne(filter).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Partner product not found" });
    }

    res.status(200).json({ success: true, mode, product: serializeProduct(product) });
  } catch (error) {
    console.error("Partner Product Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load partner product" });
  }
};

// Active campaigns that carry admin-authored banner content. Only campaigns
// for partners enabled by the current mode are returned.
exports.getPartnerBanners = async (req, res) => {
  try {
    const mode = await getPartnerMode();
    const enabledKeys = partnersForMode(mode);
    if (!enabledKeys.length) {
      return res.status(200).json({ success: true, mode, enabled: false, banners: [] });
    }

    const now = new Date();
    const campaigns = await PartnerCampaign.find({
      partner: { $in: enabledKeys },
      status: "active",
      $and: [
        {
          $or: [
            { bannerImageUrl: { $nin: ["", null] } },
            { bannerTitle: { $nin: ["", null] } },
          ],
        },
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(4)
      .lean();

    res.status(200).json({
      success: true,
      mode,
      enabled: true,
      banners: campaigns.map((campaign) => ({
        campaignId: campaign._id,
        partner: campaign.partner,
        campaignName: campaign.name,
        title: campaign.bannerTitle || campaign.name,
        subtitle: campaign.bannerSubtitle || "",
        imageUrl: campaign.bannerImageUrl || "",
        ctaLabel: campaign.bannerCtaLabel || "Shop the deals",
      })),
    });
  } catch (error) {
    console.error("Partner Banners Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load partner banners" });
  }
};

exports.createPartnerClick = async (req, res) => {
  const { productId } = req.body || {};
  if (!isObjectId(productId)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    const mode = await getPartnerMode();
    const enabledKeys = partnersForMode(mode);
    if (!enabledKeys.length) {
      return res.status(404).json({ success: false, message: "Partner products are not available" });
    }

    const filter = await visibleProductsFilter(enabledKeys);
    filter._id = productId;

    const product = await PartnerProduct.findOne(filter).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: "Partner product not found" });
    }

    const destination = resolveProductDestination(product);
    if (!isAllowedPartnerUrl(product.partner, destination)) {
      return res.status(409).json({
        success: false,
        message: "This partner link is not approved for redirection.",
      });
    }

    const userAgent = String(req.get("user-agent") || "").slice(0, 500);
    const referrerHeader = String(req.get("referer") || "").slice(0, 2048);
    const referrer = parseHttpsUrl(referrerHeader) ? referrerHeader : "";
    const forwarded = String(req.get("x-forwarded-for") || req.socket?.remoteAddress || "");
    const ip = forwarded.split(",")[0].trim() || "unknown";

    const clickId = crypto.randomBytes(16).toString("hex");

    await PartnerClick.create({
      clickId,
      partner: product.partner,
      productId: product._id,
      campaignId: product.campaignId || null,
      userId: req.user ? req.user._id : null,
      ipHash: hashIp(ip),
      userAgent,
      referrer,
      destinationUrl: destination,
      isDemo: product.source === "demo",
    });

    await PartnerProduct.updateOne({ _id: product._id }, { $inc: { clicks: 1 } }).catch(() => {});

    res.status(201).json({
      success: true,
      clickId,
      isDemo: product.source === "demo",
      redirectUrl: `${publicBaseUrl(req)}/api/partner/go/${clickId}`,
    });
  } catch (error) {
    console.error("Partner Click Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to record partner click" });
  }
};

exports.redirectPartnerClick = async (req, res) => {
  const { clickId } = req.params;

  if (!/^[a-f0-9]{32}$/.test(clickId)) {
    return res.status(400).send("Invalid link");
  }

  try {
    const click = await PartnerClick.findOne({ clickId }).lean();
    if (!click) {
      return res.status(404).send("Link expired");
    }

    let destination = click.destinationUrl;
    if (!isAllowedPartnerUrl(click.partner, destination)) {
      destination = resolveProductDestination({ partner: click.partner });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.redirect(302, destination);
  } catch (error) {
    console.error("Partner Redirect Error:", error.message);
    return res.status(500).send("Redirect failed");
  }
};
