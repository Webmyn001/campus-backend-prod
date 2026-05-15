const mongoose = require("mongoose");
require("dotenv").config();
const Analytics = require("./Models/Analytics");
const User = require("./Models/User");
const VipListing = require("./Models/vipListing");
const Listing = require("./Models/Listing1");
const sendEmail = require("./utils/sendEmail");

async function runTest() {
    const targetEmail = process.argv[2] || "bellomuhyideen0001@gmail.com";
    
    try {
        console.log(`Connecting to MongoDB...`);
        await mongoose.connect(process.env.MONGO_URI);
        console.log(`Connected.`);

        console.log(`Finding user: ${targetEmail}`);
        const user = await User.findOne({ email: targetEmail });
        if (!user) {
            console.error(`User not found!`);
            process.exit(1);
        }

        const userId = user._id;
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

        console.log(`Aggregating stats for user ${userId} since ${sevenDaysAgoStr}...`);
        
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

        console.log(`Stats found: Views: ${overview.totalViews}, Clicks: ${overview.totalClicks}`);

        // If no data, use dummy data for the test
        if (overview.totalViews === 0 && overview.totalClicks === 0) {
            console.log("No real data found in the last 7 days. Using dummy data for testing...");
            overview.totalViews = 124;
            overview.totalClicks = 8;
        }

        let topProductsListHtml = "";
        if (topProductsRaw.length > 0) {
            for (const p of topProductsRaw) {
                let title = "Item";
                try {
                    if (p.type === "viplisting") {
                        const item = await VipListing.findById(p._id).select("businessName title");
                        title = item ? (item.businessName || item.title) : title;
                    } else {
                        const item = await Listing.findById(p._id).select("title name");
                        title = item ? (item.title || item.name) : title;
                    }
                } catch (err) {}
                topProductsListHtml += `<li><strong>${title}</strong>: ${p.views} views, ${p.clicks} leads</li>`;
            }
        } else {
            topProductsListHtml = `
                <li><strong>Sample Product A</strong>: 45 views, 3 leads</li>
                <li><strong>Sample Service B</strong>: 32 views, 2 leads</li>
                <li><strong>Sample Product C</strong>: 21 views, 1 lead</li>
            `;
        }

        const emailHtml = `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #6366f1; margin: 0;">CampusCrave</h1>
                    <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">Performance Insights</p>
                </div>
                
                <h2 style="color: #1f2937; text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px;">Weekly Performance Report</h2>
                
                <p>Hello <strong>${user.name || 'Seller'}</strong>,</p>
                
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

                <div style="margin-bottom: 25px;">
                    <h3 style="color: #374151; font-size: 16px; margin-bottom: 15px; border-left: 4px solid #6366f1; padding-left: 10px;">Top Performing Items</h3>
                    <ul style="padding-left: 0; list-style: none;">
                        ${topProductsListHtml.replace(/<li>/g, '<li style="padding: 10px; background: #f9fafb; margin-bottom: 8px; border-radius: 8px; border-left: 3px solid #6366f1;">')}
                    </ul>
                </div>

                <div style="background: #eff6ff; padding: 15px; border-radius: 8px; border: 1px solid #dbeafe; margin-bottom: 25px;">
                    <p style="margin: 0; font-size: 13px; color: #1e40af;">
                        <strong>Note:</strong> The CampusCrave team is actively promoting your goods and services to ensure they reach as many students as possible.
                    </p>
                </div>

                <div style="margin-bottom: 25px;">
                    <h3 style="color: #374151; font-size: 16px;">Tips to Grow Further:</h3>
                    <ul style="color: #4b5563; font-size: 14px;">
                        <li style="margin-bottom: 8px;">Keep posting new and high-quality items.</li>
                        <li style="margin-bottom: 8px;">Invite your friends and fellow students to join the platform.</li>
                        <li style="margin-bottom: 8px;">Share your store link on your social media status daily.</li>
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

        console.log(`Sending email to ${user.email}...`);
        await sendEmail(
            user.email,
            `[TEST] Weekly Performance Report - CampusCrave`,
            emailHtml
        );

        console.log(`✅ Success! Email sent.`);
        process.exit(0);
    } catch (err) {
        console.error(`❌ Error:`, err);
        process.exit(1);
    }
}

runTest();
