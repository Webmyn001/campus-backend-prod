const User = require("../Models/User");
const Setting = require("../Models/Setting");
const Analytics = require("../Models/Analytics");
const VipListing = require("../Models/vipListing");
const Listing = require("../Models/Listing1");
const Subscription = require("../Models/Subscription");
const mongoose = require("mongoose");
const {
  enqueueBulkEmails,
  processBulkEmailQueue,
} = require("../jobs/bulkEmailQueue");

// Send bulk email to list of users or all users
exports.sendBulkEmail = async (req, res) => {
  const { subject, body, emails } = req.body;

  if (!subject || !body || !emails || !Array.isArray(emails)) {
    return res.status(400).json({ message: "Subject, body, and emails array are required." });
  }

  try {
    const users = await User.find({ email: { $in: emails } }).select("email name");
    const userMap = {};
    users.forEach((u) => {
      userMap[u.email] = u.name || "CampusCraver";
    });

    await enqueueBulkEmails(subject, body, emails, userMap);

    const result = await processBulkEmailQueue();

    return res.status(200).json({
      message: "Bulk email queued successfully. Processing has started.",
      sentToday: result.sentToday,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      queued: result.queued,
      remainingCapacity: result.remainingCapacity,
    });
  } catch (error) {
    console.error("Bulk Email Error:", error);
    res.status(500).json({ message: "Failed to queue bulk emails", error: error.message });
  }
};

exports.continueBulkEmailQueue = async (req, res) => {
  try {
    const result = await processBulkEmailQueue();
    return res.status(200).json({
      message: "Bulk email queue processed.",
      sentToday: result.sentToday,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      queued: result.queued,
      remainingCapacity: result.remainingCapacity,
    });
  } catch (error) {
    console.error("Continue Bulk Email Queue Error:", error);
    res.status(500).json({ message: "Failed to process bulk email queue", error: error.message });
  }
};

exports.getBulkEmailQueueStatus = async (req, res) => {
  try {
    const BulkEmailQueue = require("../Models/BulkEmailQueue");
    
    const totalQueued = await BulkEmailQueue.countDocuments({ status: "pending" });
    const totalSent = await BulkEmailQueue.countDocuments({ status: "sent" });
    const totalFailed = await BulkEmailQueue.countDocuments({ status: "failed" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await BulkEmailQueue.countDocuments({
      status: "sent",
      sentAt: { $gte: today },
    });

    const DAILY_LIMIT = Number(process.env.BULK_EMAIL_DAILY_LIMIT) || 60;
    const remainingCapacity = Math.max(0, DAILY_LIMIT - sentToday);

    return res.status(200).json({
      status: "success",
      queue: {
        pending: totalQueued,
        sent: totalSent,
        failed: totalFailed,
        total: totalQueued + totalSent + totalFailed,
      },
      today: {
        sent: sentToday,
        dailyLimit: DAILY_LIMIT,
        remainingCapacity,
      },
    });
  } catch (error) {
    console.error("Get Bulk Email Queue Status Error:", error);
    res.status(500).json({ message: "Failed to get queue status", error: error.message });
  }
};

// Update global promo status
exports.updatePromoStatus = async (req, res) => {
    const { isPromoActive } = req.body;

    if (typeof isPromoActive !== "boolean") {
        return res.status(400).json({ message: "isPromoActive boolean is required." });
    }

    try {
        const setting = await Setting.findOneAndUpdate(
            { key: "isPromoActive" },
            { value: isPromoActive, updatedAt: Date.now() },
            { upsert: true, new: true }
        );

        res.status(200).json({
            message: `Promo status updated to ${isPromoActive}`,
            isPromoActive: setting.value
        });
    } catch (error) {
        console.error("Update Promo Status Error:", error);
        res.status(500).json({ message: "Failed to update promo status", error: error.message });
    }
};

// Send a test performance summary report to a specific email
exports.sendTestReport = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Target email is required." });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found with this email." });
        }

        const userId = user._id;
        const now = new Date();

        // Check if user has active subscription
        const activeSub = await Subscription.findOne({
            userId,
            paymentStatus: "successful",
            expiresAt: { $gte: now }
        });

        if (!activeSub) {
            return res.status(403).json({ message: "This user does not have an active subscription for analytics reports." });
        }

        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

        // Aggregate stats
        const stats = await Analytics.aggregate([
            { 
                $match: { 
                    sellerId: userId,
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
                                totalClicks: { $sum: "$whatsappClicks" }
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
                        { $limit: 3 }
                    ]
                }
            }
        ]);

        const overview = stats[0]?.overview?.[0] || { totalViews: 0, totalClicks: 0 };
        const topProductsRaw = stats[0]?.products || [];

        // Threshold for "Success" vs "Encouragement"
        // Success: 10+ views OR 2+ leads
        const hasSolidActivity = overview.totalViews >= 10 || overview.totalClicks >= 2;
        const hasAnyActivity = overview.totalViews > 0 || overview.totalClicks > 0;

        let topProductsListHtml = "";
        if (topProductsRaw.length > 0) {
            for (const p of topProductsRaw) {
                let title = "Item";
                if (p.type === "viplisting") {
                    const item = await VipListing.findById(p._id).select("businessName title");
                    title = item ? (item.businessName || item.title) : title;
                } else {
                    const item = await Listing.findById(p._id).select("title name");
                    title = item ? (item.title || item.name) : title;
                }
                topProductsListHtml += `<li><strong>${title}</strong>: ${p.views} views, ${p.clicks} leads</li>`;
            }
        }

        const emailHtml = `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #6366f1; margin: 0;">CampusCrave</h1>
                    <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">Performance Insights</p>
                </div>
                
                <h2 style="color: #1f2937; text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px;">Weekly Performance Report</h2>
                
                <p>Hello <strong>${user.name || 'Seller'}</strong>,</p>
                
                ${hasSolidActivity ? `
                    <p>We are pleased to share your weekly store performance summary from <strong>CampusCrave</strong>. Over the past 7 days, your listings have gained traction among the student community.</p>
                    
                    <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #bbf7d0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="text-align: center; padding: 10px; border-right: 1px solid #bbf7d0;">
                                    <div style="font-size: 24px; font-weight: 800; color: #16a34a;">${overview.totalViews}</div>
                                    <div style="font-size: 11px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 1px;">Total Views</div>
                                </td>
                                <td style="text-align: center; padding: 10px;">
                                    <div style="font-size: 24px; font-weight: 800; color: #16a34a;">${overview.totalClicks}</div>
                                    <div style="font-size: 11px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 1px;">WhatsApp Leads</div>
                                </td>
                            </tr>
                        </table>
                    </div>

                    ${topProductsListHtml ? `
                        <div style="margin-bottom: 25px;">
                            <h3 style="color: #374151; font-size: 16px; margin-bottom: 15px; border-left: 4px solid #6366f1; padding-left: 10px;">Top Performing Items</h3>
                            <ul style="padding-left: 0; list-style: none;">
                                ${topProductsListHtml.replace(/<li>/g, '<li style="padding: 10px; background: #f9fafb; margin-bottom: 8px; border-radius: 8px; border-left: 3px solid #6366f1;">')}
                            </ul>
                        </div>
                    ` : ''}
                ` : `
                    <div style="background: #fffbeb; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #fde68a; text-align: center;">
                        <p style="margin: 0; color: #92400e; font-weight: bold;">${hasAnyActivity ? 'Keep the momentum going!' : 'No activity recorded this week.'}</p>
                        <p style="margin: 5px 0 0; color: #b45309; font-size: 13px;">
                            ${hasAnyActivity 
                                ? `You had ${overview.totalViews} views and ${overview.totalClicks} leads this week. You're off to a good start, but there's room for growth!` 
                                : 'Your store didn\'t receive any new views or leads over the past 7 days.'}
                        </p>
                    </div>
                    
                    <p>Don't worry! Every successful campus business has quiet weeks. To get back on track and start reaching more students, we recommend updating your inventory with fresh items.</p>
                `}

                <div style="background: #eff6ff; padding: 15px; border-radius: 8px; border: 1px solid #dbeafe; margin-bottom: 25px;">
                    <p style="margin: 0; font-size: 13px; color: #1e40af;">
                        <strong>Did you know?</strong> The CampusCrave team is actively promoting your goods and services to ensure they reach as many students as possible.
                    </p>
                </div>

                <div style="margin-bottom: 25px;">
                    <h3 style="color: #374151; font-size: 16px;">Tips to Grow Your Store:</h3>
                    <ul style="color: #4b5563; font-size: 14px;">
                        <li style="margin-bottom: 8px;"><strong>Post More Frequently:</strong> New listings appear at the top of the marketplace.</li>
                        <li style="margin-bottom: 8px;"><strong>Better Photos:</strong> High-quality, clear images attract 3x more clicks.</li>
                        <li style="margin-bottom: 8px;"><strong>Share Your Link:</strong> Put your store link in your social media bio and status daily.</li>
                    </ul>
                </div>

                <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                    Thank you for being a valued part of our marketplace. We are committed to helping your business thrive on campus.
                </p>

                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 5px;"><strong>The CampusCrave Team</strong></p>
                
                <div style="text-align: center; font-size: 11px; color: #9ca3af; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                    <p>&copy; ${new Date().getFullYear()} CampusCrave Nigeria. All rights reserved.</p>
                </div>
            </div>
        `;

        await sendEmail(
            user.email,
            `Weekly Performance Report - CampusCrave`,
            emailHtml
        );

        res.status(200).json({ 
            success: true, 
            message: `Report sent to ${user.email}`,
            hasSolidActivity,
            hasAnyActivity
        });
    } catch (error) {
        console.error("Send Test Report Error:", error);
        res.status(500).json({ message: "Failed to send test report", error: error.message });
    }
};
