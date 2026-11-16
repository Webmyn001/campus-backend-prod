const crypto = require("crypto");
const { timingSafeEqualStrings } = require("../../utils/security");
const { partnerMeta } = require("./registry");

function webhookSecret(partnerKey) {
  const meta = partnerMeta(partnerKey);
  if (!meta) return "";
  return process.env[`${meta.key.toUpperCase()}_WEBHOOK_SECRET`] || "";
}

function signPayload(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function signatureFromRequest(req, partnerKey) {
  const meta = partnerMeta(partnerKey);
  const header = req.headers["x-partner-signature"] || (meta && req.headers[meta.webhookSignatureHeader]);
  if (Array.isArray(header)) return header[0] || "";
  return typeof header === "string" ? header.trim() : "";
}

// Fail closed: without a configured secret, partner webhooks are rejected.
function verifyPartnerSignature(partnerKey, rawBody, signature) {
  const secret = webhookSecret(partnerKey);
  if (!secret) {
    return { ok: false, configured: false };
  }

  if (!signature || rawBody === undefined || rawBody === null) {
    return { ok: false, configured: true };
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const expected = signPayload(secret, payload);
  const received = String(signature).trim().replace(/^sha256=/i, "").toLowerCase();

  return { ok: timingSafeEqualStrings(expected, received), configured: true };
}

module.exports = {
  webhookSecret,
  signPayload,
  signatureFromRequest,
  verifyPartnerSignature,
};
