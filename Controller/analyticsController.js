const Analytics = require("../Models/Analytics");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const Product = require("../Models/Product");
const Visit = require("../Models/Visit");
const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * @desc Track a unique visitor per day using hashed IP
 */
const trackVisit = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown_ip";
    
    // Hash IP address with SHA-256 for privacy compliance
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

    // Perform an upsert to count unique visitors per day
    await Visit.findOneAndUpdate(
      { date: today, ipHash: ipHash },
      { $set: { date: today, ipHash: ipHash } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Visit tracked" });
  } catch (err) {
    // If it fails with duplicate key (E11000) it means they already visited today
    if (err.code === 11000) {
      return res.json({ success: true, message: "Visit already tracked today" });
    }
    console.error("Track Visit Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Track a view or whatsapp click
 */
const trackEvent = async (req, res) => {
  try {
    const { productId, sellerId, eventType, type } = req.body;
    
    if (!productId || !sellerId || !eventType || !type) {
      return res.status(400).json({ success: false, message: "Missing tracking data" });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // 1. Update the Main Model (atomic increment)
    let Model;
    if (type === "viplisting") Model = VipListing;
    else if (type === "listing") Model = Listing;
    else if (type === "admin-product") Model = Product;
    else return res.status(400).json({ success: false, message: "Invalid type" });

    const updateField = eventType === "view" ? { views: 1 } : { whatsappClicks: 1 };
    
    await Model.findByIdAndUpdate(productId, { $inc: updateField });

    // 2. Update the Daily Analytic snapshot (upsert)
    // Resolve sellerId if it's an object or a string placeholder
    let resolvedSellerId = sellerId;
    if (typeof sellerId === "object" && sellerId !== null) {
      resolvedSellerId = sellerId.id || sellerId._id;
    }

    if (typeof resolvedSellerId === "string") {
      resolvedSellerId = resolvedSellerId.trim();
      if (resolvedSellerId === "official_campuscrave_id" || resolvedSellerId === "admin") {
        resolvedSellerId = "654a1a000000000000000000";
      }
    }

    if (resolvedSellerId === "undefined" || resolvedSellerId === "null" || !resolvedSellerId) {
      resolvedSellerId = null;
    }

    if (resolvedSellerId && mongoose.Types.ObjectId.isValid(resolvedSellerId)) {
      await Analytics.findOneAndUpdate(
        { date: today, productId: productId },
        { 
          $inc: updateField,
          $set: { sellerId: new mongoose.Types.ObjectId(resolvedSellerId), type: type } 
        },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, message: "Event tracked" });
  } catch (err) {
    console.error("Tracking Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Get stats for a specific user's store (last 7 days, last 30 days)
 */
const getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    let targetUserId = userId;
    if (req.user && (req.user.role === "admin" || userId === "official_campuscrave_id" || userId === "admin")) {
      targetUserId = "654a1a000000000000000000";
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    // Get aggregated stats for the last 7 days including product breakdown
    const stats = await Analytics.aggregate([
      { 
        $match: { 
          sellerId: new mongoose.Types.ObjectId(targetUserId),
          date: { $gte: sevenDaysAgoStr }
        } 
      },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: "$date",
                views: { $sum: "$views" },
                clicks: { $sum: "$whatsappClicks" }
              }
            },
            { $sort: { _id: 1 } },
            {
              $group: {
                _id: null,
                totalViews: { $sum: "$views" },
                totalClicks: { $sum: "$clicks" },
                dailyData: {
                  $push: {
                    date: "$_id",
                    views: "$views",
                    clicks: "$clicks"
                  }
                }
              }
            }
          ],
          products: [
            {
              $group: {
                _id: "$productId",
                views: { $sum: "$views" },
                clicks: { $sum: "$whatsappClicks" },
                type: { $first: "$type" }
              }
            },
            { $sort: { views: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    const overview = stats[0]?.overview?.[0] || { totalViews: 0, totalClicks: 0, dailyData: [] };
    const rawProducts = stats[0]?.products || [];

    // Fetch product details for the top items
    const productBreakdown = [];
    for (const p of rawProducts) {
      let title = "Unknown Product";
      if (p.type === "viplisting") {
        const item = await VipListing.findById(p._id).select("businessName title");
        title = item ? (item.businessName || item.title) : title;
      } else if (p.type === "admin-product") {
        const item = await Product.findById(p._id).select("name");
        title = item ? item.name : title;
      } else {
        const item = await Listing.findById(p._id).select("title");
        title = item ? item.title : title;
      }
      productBreakdown.push({
        productId: p._id,
        title,
        views: p.views,
        clicks: p.clicks,
        type: p.type
      });
    }

    const result = {
      ...overview,
      productBreakdown,
    };
    
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Get User Stats Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Get global stats for Admin (for sponsors)
 */
const getGlobalStats = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const stats = await Analytics.aggregate([
      { 
        $match: { 
          date: { $gte: thirtyDaysAgoStr }
        } 
      },
      {
        $facet: {
          chartData: [
            {
              $group: {
                _id: "$date",
                views: { $sum: "$views" },
                clicks: { $sum: "$whatsappClicks" }
              }
            },
            { $sort: { _id: 1 } }
          ],
          products: [
            {
              $group: {
                _id: "$productId",
                views: { $sum: "$views" },
                clicks: { $sum: "$whatsappClicks" },
                type: { $first: "$type" }
              }
            },
            { $sort: { views: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    const chartData = stats[0]?.chartData || [];
    const rawProducts = stats[0]?.products || [];

    // Fetch unique visitor counts for the last 30 days
    const visitsData = await Visit.aggregate([
      { $match: { date: { $gte: thirtyDaysAgoStr } } },
      { $group: { _id: "$date", count: { $sum: 1 } } }
    ]);

    const visitsMap = {};
    visitsData.forEach(v => {
      visitsMap[v._id] = v.count;
    });

    // Generate full list of the last 30 days to ensure a continuous timeline
    const dateList = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dateList.push(d.toISOString().split("T")[0]);
    }

    const viewsMap = {};
    const clicksMap = {};
    chartData.forEach(c => {
      viewsMap[c._id] = c.views;
      clicksMap[c._id] = c.clicks;
    });

    const finalChartData = dateList.map(date => ({
      date,
      views: viewsMap[date] || 0,
      clicks: clicksMap[date] || 0,
      visits: visitsMap[date] || 0
    }));

    // Fetch product details for the top items
    const productBreakdown = [];
    for (const p of rawProducts) {
      let title = "Unknown Item";
      if (p.type === "viplisting") {
        const item = await VipListing.findById(p._id).select("businessName title");
        title = item ? (item.businessName || item.title) : title;
      } else if (p.type === "admin-product") {
        const item = await Product.findById(p._id).select("name");
        title = item ? item.name : title;
      } else {
        const item = await Listing.findById(p._id).select("title name");
        title = item ? (item.title || item.name) : title;
      }
      productBreakdown.push({
        productId: p._id,
        title,
        views: p.views,
        clicks: p.clicks,
        type: p.type
      });
    }

    res.json({ 
      success: true, 
      data: {
        chartData: finalChartData,
        productBreakdown
      }
    });
  } catch (err) {
    console.error("Get Global Stats Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Get trending items (Top 10 overall in last 7 days)
 */
const getTrendingItems = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const trendingAgg = await Analytics.aggregate([
      { 
        $match: { 
          date: { $gte: sevenDaysAgoStr }
        } 
      },
      {
        $group: {
          _id: "$productId",
          weeklyViews: { $sum: "$views" },
          type: { $first: "$type" },
          sellerId: { $first: "$sellerId" }
        }
      },
      { $sort: { weeklyViews: -1 } },
      { $limit: limit * 3 } // Fetch more to handle ties via randomization
    ]);

    // Shuffle ties in Javascript for fair exposure
    trendingAgg.sort((a, b) => {
      if (b.weeklyViews !== a.weeklyViews) {
        return b.weeklyViews - a.weeklyViews;
      }
      return Math.random() - 0.5;
    });

    const limitedTrending = trendingAgg.slice(0, limit);

    const result = [];
    for (const item of limitedTrending) {
      let data = null;
      if (item.type === "viplisting") {
        data = await VipListing.findOne({ _id: item._id, status: { $ne: "pending" } });
      } else if (item.type === "admin-product") {
        data = await Product.findById(item._id);
      } else {
        data = await Listing.findOne({ _id: item._id, status: { $ne: "pending" } });
      }

      if (data) {
        result.push({
          ...data.toObject(),
          weeklyViews: item.weeklyViews,
          type: item.type === "viplisting" ? "service" : (item.type === "admin-product" ? "product" : "community")
        });
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("❌ DETAILED GET TRENDING ERROR:", {
      message: err.message,
      stack: err.stack,
      query: req.query
    });
    res.status(500).json({ success: false, message: "Server error", internalError: err.message });
  }
};

module.exports = {
  trackEvent,
  getUserStats,
  getGlobalStats,
  getTrendingItems,
  trackVisit,
};
