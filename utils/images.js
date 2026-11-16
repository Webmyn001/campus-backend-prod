const { isHttpsUrl } = require("./security");

const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES) || 8 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;
const RAW_BASE64_RE = /^[A-Za-z0-9+/=\s]+$/;

function decodeAndCheck(base64) {
  const cleaned = base64.replace(/\s/g, "");
  if (!cleaned) throw new Error("Image data is empty");
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) throw new Error("Image data is invalid");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large");
  }
  return buffer;
}

// Accepts a data URL, a raw base64 string (legacy clients) or an https URL.
// Returns a value that is safe to hand to Cloudinary.
function normalizeImagePayload(value) {
  if (value && typeof value === "object" && typeof value.url === "string") {
    value = value.url;
  }
  if (typeof value !== "string") {
    throw new Error("Invalid image payload");
  }

  const input = value.trim();
  if (!input) throw new Error("Image data is empty");

  if (input.startsWith("data:")) {
    const match = input.match(DATA_URL_RE);
    if (!match) throw new Error("Only PNG, JPEG, WEBP or GIF images are allowed");
    const buffer = decodeAndCheck(match[2]);
    return `data:${match[1].toLowerCase()};base64,${buffer.toString("base64")}`;
  }

  if (isHttpsUrl(input)) return input;

  if (RAW_BASE64_RE.test(input)) {
    const buffer = decodeAndCheck(input);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  throw new Error("Only image data URLs or https image links are allowed");
}

module.exports = {
  MAX_IMAGE_BYTES,
  normalizeImagePayload,
};
