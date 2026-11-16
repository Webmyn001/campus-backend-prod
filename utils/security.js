const crypto = require("crypto");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isNonEmptyString(value, maxLength = 10000) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function sanitizeText(value, maxLength = 5000) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\u0000/g, "").trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isObjectId(value) {
  if (!value) return false;
  const str = String(value);
  return /^[a-fA-F0-9]{24}$/.test(str);
}

function timingSafeEqualStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || process.env.JWT_SECRET || "campuscrave";
  return crypto
    .createHmac("sha256", salt)
    .update(String(ip || "unknown"))
    .digest("hex");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseHttpsUrl(value, { maxLength = 2048 } = {}) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > maxLength || /\s/.test(raw)) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url;
}

function isHttpsUrl(value, options) {
  return !!parseHttpsUrl(value, options);
}

function toSafeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function toSafeInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const int = Math.trunc(number);
  if (int < min || int > max) return fallback;
  return int;
}

module.exports = {
  isNonEmptyString,
  sanitizeText,
  normalizeEmail,
  escapeRegex,
  isObjectId,
  timingSafeEqualStrings,
  hashIp,
  escapeHtml,
  parseHttpsUrl,
  isHttpsUrl,
  toSafeBoolean,
  toSafeInt,
};
