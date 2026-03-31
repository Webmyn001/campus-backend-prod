const express = require("express");
const User = require("../Models/User");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");

const router = express.Router();

router.get("/store/:identifier", async (req, res) => {
    const { identifier } = req.params;

    try {
        // 1. Find user by either _id or username
        let user;
        if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
            user = await User.findById(identifier).select("name username profilePhoto");
        }

        if (!user) {
            user = await User.findOne({
                username: { $regex: new RegExp(`^${identifier}$`, 'i') }
            }).select("name username profilePhoto");
        }

        if (!user && identifier.length === 10) {
            // Fallback: search by short ID (last 10 characters of MongoDB _id)
            user = await User.findOne({
                $expr: {
                    $regexMatch: {
                        input: { $toString: "$_id" },
                        regex: identifier + "$",
                        options: "i"
                    }
                }
            }).select("name username profilePhoto");
        }

        if (!user) {
            // Return a default fallback HTML instead of 404 so sharing doesn't completely break
            const fallbackRedirect = process.env.CLIENT_URL || "https://www.campuscrave.ng/";
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Store Not Found | Campus Crave</title>
                    <meta property="og:title" content="Store Not Found | Campus Crave" />
                    <meta property="og:description" content="This store could not be found." />
                    <script>window.location.href = "${fallbackRedirect}";</script>
                </head>
                <body>Redirecting to Campus Crave...</body>
                </html>
            `);
        }

        const userId = user._id.toString();
        const storeName = user.username ? `@${user.username}'s Store` : `${user.name.split(' ')[0]}'s Store`;
        const storeTitle = `${storeName} | Campus Crave`;
        const storeDescription = `Check out all the products and services from ${user.name} on Campus Crave.`;

        // Find a representative image (from VIP Listings first, then regular listings)
        let ogImage = "https://www.campuscrave.ng/og-default.jpg"; // Replace with your actual default OG image URL

        // Let's try to get the newest VIP listing image
        const latestVip = await VipListing.findOne({
            $or: [
                { "sellerInfo.id": userId },
                { "sellerInfo._id": userId },
                { "sellerInfo": userId }
            ]
        }).sort({ postedAt: -1 });

        if (latestVip && latestVip.images && latestVip.images.length > 0) {
            ogImage = latestVip.images[0].url;
        } else {
            // Try regular listings
            const latestListing = await Listing.findOne({
                $or: [
                    { "sellerInfo.id": userId },
                    { "sellerInfo._id": userId },
                    { "sellerInfo": userId }
                ]
            }).sort({ postedAt: -1 });

            if (latestListing && latestListing.images && latestListing.images.length > 0) {
                ogImage = latestListing.images[0].url;
            } else if (user.profilePhoto && user.profilePhoto.url) {
                // Fallback to user profile photo
                ogImage = user.profilePhoto.url;
            }
        }

        const clientUrl = process.env.CLIENT_URL || "https://www.campuscrave.ng";
        const frontendUrl = `${clientUrl}/store/${user.username || user._id}`;

        // Generate static HTML with Open Graph tags
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${storeTitle}</title>
                
                <!-- Primary Meta Tags -->
                <meta name="title" content="${storeTitle}">
                <meta name="description" content="${storeDescription}">

                <!-- Open Graph / Facebook / WhatsApp -->
                <meta property="og:type" content="website">
                <meta property="og:url" content="${frontendUrl}">
                <meta property="og:title" content="${storeTitle}">
                <meta property="og:description" content="${storeDescription}">
                <meta property="og:image" content="${ogImage}">

                <!-- Twitter -->
                <meta property="twitter:card" content="summary_large_image">
                <meta property="twitter:url" content="${frontendUrl}">
                <meta property="twitter:title" content="${storeTitle}">
                <meta property="twitter:description" content="${storeDescription}">
                <meta property="twitter:image" content="${ogImage}">

                <!-- Redirect to SPA -->
                <script>
                    window.location.replace("${frontendUrl}");
                </script>
            </head>
            <body>
                <p>Redirecting to ${storeName} on Campus Crave...</p>
                <a href="${frontendUrl}">Click here if not redirected automatically.</a>
            </body>
            </html>
        `;

        res.send(html);

    } catch (error) {
        console.error("OpenGraph Preview Error:", error);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = router;
