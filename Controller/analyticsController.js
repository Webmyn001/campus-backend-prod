const Analytics = require("../Models/Analytics");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const Product = require("../Models/Product");
const mongoose = require("mongoose");

/**
 * @desc Track a view or whatsapp click
 */
const trackEvent = async (req, res) => {
  try {
    const { productId, sellerId, eventType, type } = req.body;
    
    if (!productId || !sellerId || !eventType || !type) {
      return res.status(400).json({ success: false, message: "Missing tracking data" });
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
    // For admin products, we might not have a valid mongoose ObjectId for sellerId if we use a placeholder string.
    // However, our trackEvent frontend should pass a valid admin user ID or we skip snapshot for simple views.
    if (mongoose.Types.ObjectId.isValid(sellerId)) {
      await Analytics.findOneAndUpdate(
        { date: today, productId: productId },
        { 
          $inc: updateField,
          $set: { sellerId: sellerId, type: type === "admin-product" ? "listing" : type } 
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
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    // Get aggregated stats for the last 7 days including product breakdown
    const stats = await Analytics.aggregate([
      { 
        $match: { 
          sellerId: new mongoose.Types.ObjectId(userId),
          date: { $gte: sevenDaysAgoStr }
        } 
      },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalViews: { $sum: "$views" },
                totalClicks: { $sum: "$whatsappClicks" },
                dailyData: {
                  $push: {
                    date: "$date",
                    views: "$views",
                    clicks: "$whatsappClicks"
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

    // Fetch product details for the top items
    const productBreakdown = [];
    for (const p of rawProducts) {
      let title = "Unknown Item";
      if (p.type === "viplisting") {
        const item = await VipListing.findById(p._id).select("businessName title");
        title = item ? (item.businessName || item.title) : title;
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
        chartData,
        productBreakdown
      }
    });
  } catch (err) {
    console.error("Get Global Stats Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  trackEvent,
  getUserStats,
  getGlobalStats,
};
