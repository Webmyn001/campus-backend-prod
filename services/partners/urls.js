const { parseHttpsUrl } = require("../../utils/security");
const { partnerMeta } = require("./registry");

function envHosts(partnerKey) {
  const raw = process.env[`PARTNER_ALLOWED_HOSTS_${String(partnerKey).toUpperCase()}`] || "";
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

function allowedHosts(partnerKey) {
  const meta = partnerMeta(partnerKey);
  if (!meta) return [];
  return [...new Set([...meta.hosts, ...envHosts(meta.key)])];
}

function hostMatches(host, allowed) {
  const normalized = String(host || "").toLowerCase();
  return allowed.some((entry) => normalized === entry || normalized.endsWith(`.${entry}`));
}

// Only https links pointing at the partner's own domains are accepted.
function isAllowedPartnerUrl(partnerKey, rawUrl) {
  const url = parseHttpsUrl(rawUrl);
  if (!url) return false;
  if (url.port && !["", "443"].includes(url.port)) return false;
  return hostMatches(url.hostname, allowedHosts(partnerKey));
}

function resolveProductDestination(product) {
  if (!product) return null;
  const candidates = [product.affiliateUrl, product.productUrl];
  for (const candidate of candidates) {
    if (isAllowedPartnerUrl(product.partner, candidate)) {
      return candidate.trim();
    }
  }
  const meta = partnerMeta(product.partner);
  return meta ? meta.websiteUrl : null;
}

module.exports = {
  allowedHosts,
  isAllowedPartnerUrl,
  resolveProductDestination,
};
