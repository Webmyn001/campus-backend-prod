const cron = require("node-cron");
const Analytics = require("../Models/Analytics");
const User = require("../Models/User");
const Subscription = require("../Models/Subscription");
const VipListing = require("../Models/vipListing");
const Listing = require("../Models/Listing1");
const sendEmail = require("../utils/sendEmail");
const mongoose = require("mongoose");
const Setting = require("../Models/Setting");

/**
 * Weekly Analytics Summary Email Job logic
 * @param {boolean} force - If true, bypasses Sunday check and "already run" check
 */
const runWeeklyAnalyticsJob = async (force = false) => {
    try {
        const now = new Date();
        const isSunday = now.getDay() === 0;
        const todayStr = now.toISOString().split("T")[0];

        // 0. Skip if not Sunday (unless forced for testing)
        if (!isSunday && !force) {
            return;
        }

        // 0.1 Skip if already run today (unless forced for testing)
        const lastRun = await Setting.findOne({ key: "last_weekly_analytics_run" });
        if (lastRun && lastRun.value === todayStr && !force) {
            console.log(`ℹ️ Weekly Analytics Job already completed for today (${todayStr}).`);
            return;
        }

        console.log("📊 Starting Weekly Analytics Email Job...");

        // 1. Get unique user IDs from active subscriptions
        const activeSubs = await Subscription.find({
            expiresAt: { $gte: now },
            paymentStatus: "successful"
        });

        let userIds = [...new Set(activeSubs.map(sub => sub.userId.toString()))];

        // 2. Ensure official account is always included
        try {
            const officialUser = await User.findOne({ username: "campuscrave" });
            if (officialUser && !userIds.includes(officialUser._id.toString())) {
                userIds.push(officialUser._id.toString());
                console.log("📊 Added official account to weekly analytics job.");
            }
        } catch (e) {}

        if (userIds.length === 0) {
            console.log("ℹ️ No active subscriptions or official account found.");
            return;
        }

        // 3. Process each user
        for (const userId of userIds) {
            try {
                const user = await User.findById(userId);
                if (!user || !user.email) continue;

                // Override email for official account as requested
                const isOfficial = user.username === "campuscrave";
                const targetEmail = isOfficial ? "bellomuhyideen1000@gmail.com" : user.email;

                // 4. Calculate date range (Last 7 days)
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

                // 5. Aggregate analytics for this user
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

                let overview = stats[0]?.overview?.[0] || { totalViews: 0, totalClicks: 0 };
                const topProductsRaw = stats[0]?.products || [];

                // Threshold for "Success" vs "Encouragement"
                const hasSolidActivity = overview.totalViews >= 10 || overview.totalClicks >= 2;
                const hasAnyActivity = overview.totalViews > 0 || overview.totalClicks > 0;

                // 6. Get product details for top 3
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

                // 7. Construct formal email (NO DUMMY DATA)
                const emailHtml = `
                    <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <h1 style="color: #6366f1; margin: 0;">CampusCrave ${isOfficial ? '(Crave Select)' : ''}</h1>
                            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">Performance Insights</p>
                        </div>
                        
                        <h2 style="color: #1f2937; text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px;">Weekly Performance Report</h2>
                        
                        <p>Hello <strong>${isOfficial ? 'Crave Select Admin' : (user.name || 'Seller')}</strong>,</p>
                        
                        ${hasSolidActivity ? `
                            <p>We are pleased to share your weekly store performance summary from <strong>CampusCrave</strong>. Over the past 7 days, your listings have gained significant traction among the student community.</p>
                            
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

                // 8. Send Email
                await sendEmail(
                    targetEmail,
                    `Weekly Performance Report - CampusCrave`,
                    emailHtml
                );

            } catch (userErr) {
                console.error(`❌ Error processing analytics email for user ${userId}:`, userErr.message);
            }
        }

        // 9. Update last run tracking
        await Setting.findOneAndUpdate(
            { key: "last_weekly_analytics_run" },
            { value: todayStr, updatedAt: new Date() },
            { upsert: true }
        );

        console.log("✅ Weekly Analytics Email Job completed.");
    } catch (err) {
        console.error("❌ Weekly Analytics Job failed:", err.message);
    }
};

// The job is now triggered by:
// 1. Server startup (in index.js)
// 2. Vercel Cron (via /api/cron/weekly-analytics)
// 3. Manual trigger (via /api/cron/weekly-analytics)

module.exports = { runWeeklyAnalyticsJob };
