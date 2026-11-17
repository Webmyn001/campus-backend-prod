const cloudinary = require("../config/cloudinary");
const { isHttpsUrl } = require("./security");
const { normalizeImagePayload } = require("./images");

const MAX_IMAGES = 8;

function getSellerId(doc) {
  const info = doc && doc.sellerInfo;
  if (!info) return null;
  if (typeof info === "string") return info;
  const raw = info.id || info._id;
  if (raw && typeof raw === "object") return raw.id || raw._id || null;
  return raw ? String(raw) : null;
}

function isOwnerOrAdmin(req, doc) {
  if (!req.user || !doc) return false;
  if (req.user.role === "admin") return true;

  const userId = String(req.user.id || "");
  const sellerId = getSellerId(doc);
  if (sellerId && userId && String(sellerId) === userId) return true;

  const info = doc.sellerInfo || {};
  const userEmail = String(req.user.email || "").toLowerCase();
  if (userEmail && String(info.email || "").toLowerCase() === userEmail) return true;

  const username = String(req.user.username || "").toLowerCase();
  if (username && String(info.username || "").toLowerCase() === username) return true;

  return false;
}

// Accepts new uploads (data URLs / base64) and already-uploaded
// { url, public_id } objects, returning the canonical schema shape.
async function normalizeListingImages(images, folder = "listings") {
  if (!Array.isArray(images)) {
    throw new Error("Images must be an array.");
  }
  if (images.length > MAX_IMAGES) {
    throw new Error(`A listing can have at most ${MAX_IMAGES} images.`);
  }

  const output = [];
  for (const entry of images) {
    if (typeof entry === "string") {
      let normalized;
      try {
        normalized = normalizeImagePayload(entry);
      } catch (error) {
        throw new Error(error.message || "Invalid image payload.");
      }
      if (isHttpsUrl(normalized)) {
        throw new Error("Images must be uploaded through the app.");
      }
      const result = await cloudinary.uploader.upload(normalized, { folder });
      output.push({ url: result.secure_url, public_id: result.public_id });
    } else if (
      entry &&
      typeof entry === "object" &&
      typeof entry.url === "string" &&
      typeof entry.public_id === "string" &&
      entry.url.length <= 2048 &&
      entry.public_id.length <= 200
    ) {
      output.push({ url: entry.url, public_id: entry.public_id });
    } else {
      throw new Error("Invalid image payload.");
    }
  }
  return output;
}

async function removeCloudinaryImages(images) {
  if (!Array.isArray(images) || images.length === 0) return;
  await Promise.all(
    images
      .filter((img) => img && typeof img.public_id === "string" && img.public_id)
      .map((img) => cloudinary.uploader.destroy(img.public_id).catch(() => null))
  );
}

function text(value, maxLength) {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.replace(/\u0000/g, "").trim();
  if (!cleaned || cleaned.length > maxLength) return undefined;
  return cleaned;
}

// Every approved listing (regular, final-year, convocation) stays on the public
// market after its campaign ends, until its stock runs out.
function publicMarketFilter() {
  return {
    status: { $nin: ["pending", "rejected"] },
    soldOut: { $ne: true },
    quantity: { $not: { $lte: 0 } },
    listingState: { $nin: ["sold", "archived", "suspended"] },
  };
}

function listingStateAfterRestock(currentState, nextQuantity) {
  return currentState === "sold" && Number(nextQuantity) > 0 ? "active" : undefined;
}

module.exports = {
  MAX_IMAGES,
  listingStateAfterRestock,
  publicMarketFilter,
  getSellerId,
  isOwnerOrAdmin,
  normalizeListingImages,
  removeCloudinaryImages,
  text,
};
