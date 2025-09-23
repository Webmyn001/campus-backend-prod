const cron = require("node-cron");
const Listing = require("../Models/Listing1");
const ProListing = require("../Models/Prolisting");
const VipListing = require("../Models/vipListing");
const cloudinary = require("../config/cloudinary");

// helper to clean one model
async function cleanupModel(Model, folderName) {
  const now = new Date();
  const expiredListings = await Model.find({ expiresAt: { $lte: now } });

  for (const listing of expiredListings) {
    if (listing.images && listing.images.length > 0) {
      for (const image of listing.images) {
        try {
          // image may be string URL or object {url, public_id}
          if (typeof image === "string") {
            // old schema storing URLs only
            const parts = image.split("/");
            const fileWithExt = parts.pop();
            const publicId = fileWithExt.split(".")[0];
            await cloudinary.uploader.destroy(`${folderName}/${publicId}`);
          } else if (image.public_id) {
            // new schema storing Cloudinary public_id
            await cloudinary.uploader.destroy(image.public_id);
          }
        } catch (err) {
          console.error(`Cloudinary delete error: ${err.message}`);
        }
      }
    }

    await Model.findByIdAndDelete(listing._id);
  }

  if (expiredListings.length > 0) {
    console.log(`🧹 Cleaned up ${expiredListings.length} expired ${folderName}`);
  }
}

// run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  try {
    await cleanupModel(Listing, "listings");
    await cleanupModel(ProListing, "pro_listings");
    await cleanupModel(VipListing, "vip_listings");
  } catch (err) {
    console.error("Cleanup job failed:", err.message);
  }
});
