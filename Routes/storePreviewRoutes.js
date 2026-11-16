const express = require("express");
const User = require("../Models/User");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const { escapeHtml, escapeRegex, isHttpsUrl } = require("../utils/security");
const { clientBaseUrl } = require("../utils/clientUrl");

const router = express.Router();

const DEFAULT_OG_IMAGE = "https://campuscrave.com.ng/campus-crave-logo.png";

function safeImage(url) {
  return typeof url === "string" && isHttpsUrl(url) ? url : DEFAULT_OG_IMAGE;
}

router.get("/store/:identifier", async (req, res) => {
  const { identifier } = req.params;

  if (!identifier || identifier.length > 100) {
    return res.status(400).send("Invalid store identifier");
  }

  try {
    let user = null;
    if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
      user = await User.findById(identifier).select("name username profilePhoto");
    }

    if (!user) {
      user = await User.findOne({
        username: { $regex: new RegExp(`^${escapeRegex(identifier)}$`, "i") },
      }).select("name username profilePhoto");
    }

    if (!user && /^[0-9a-fA-F]{10}$/.test(identifier)) {
      user = await User.findOne({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: escapeRegex(identifier) + "$",
            options: "i",
          },
        },
      }).select("name username profilePhoto");
    }

    const clientUrl = clientBaseUrl();

    if (!user) {
      const fallbackRedirect = JSON.stringify(`${clientUrl}/`);
      return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Store Not Found | Campus Crave</title>
                    <meta property="og:title" content="Store Not Found | Campus Crave" />
                    <meta property="og:description" content="This store could not be found." />
                    <script>window.location.replace(${fallbackRedirect});</script>
                </head>
                <body>Redirecting to Campus Crave...</body>
                </html>
            `);
    }

    const userId = user._id.toString();
    const displayName = String(user.name || user.username || "Seller");
    const storeName = user.username
      ? `@${user.username}'s Store`
      : `${displayName.split(" ")[0]}'s Store`;
    const storeTitle = `${storeName} | Campus Crave`;
    const storeDescription = `Check out all the products and services from ${displayName} on Campus Crave.`;

    let ogImage = DEFAULT_OG_IMAGE;

    const latestVip = await VipListing.findOne({
      $or: [{ "sellerInfo.id": userId }, { "sellerInfo._id": userId }, { sellerInfo: userId }],
    }).sort({ postedAt: -1 });

    if (latestVip && latestVip.images && latestVip.images.length > 0) {
      ogImage = safeImage(latestVip.images[0].url);
    } else {
      const latestListing = await Listing.findOne({
        $or: [{ "sellerInfo.id": userId }, { "sellerInfo._id": userId }, { sellerInfo: userId }],
      }).sort({ postedAt: -1 });

      if (latestListing && latestListing.images && latestListing.images.length > 0) {
        ogImage = safeImage(latestListing.images[0].url);
      } else if (user.profilePhoto && user.profilePhoto.url) {
        ogImage = safeImage(user.profilePhoto.url);
      }
    }

    const storePath = encodeURIComponent(user.username || user._id.toString());
    const frontendUrl = `${clientUrl}/store/${storePath}`;

    const title = escapeHtml(storeTitle);
    const description = escapeHtml(storeDescription);
    const url = escapeHtml(frontendUrl);
    const image = escapeHtml(ogImage);
    const safeStoreName = escapeHtml(storeName);
    const redirectScript = JSON.stringify(frontendUrl);

    const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>

                <meta name="title" content="${title}">
                <meta name="description" content="${description}">

                <meta property="og:type" content="website">
                <meta property="og:url" content="${url}">
                <meta property="og:title" content="${title}">
                <meta property="og:description" content="${description}">
                <meta property="og:image" content="${image}">

                <meta property="twitter:card" content="summary_large_image">
                <meta property="twitter:url" content="${url}">
                <meta property="twitter:title" content="${title}">
                <meta property="twitter:description" content="${description}">
                <meta property="twitter:image" content="${image}">

                <script>
                    window.location.replace(${redirectScript});
                </script>
            </head>
            <body>
                <p>Redirecting to ${safeStoreName} on Campus Crave...</p>
                <a href="${url}">Click here if not redirected automatically.</a>
            </body>
            </html>
        `;

    res.send(html);
  } catch (error) {
    console.error("OpenGraph Preview Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
