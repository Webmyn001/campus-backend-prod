const { PARTNER_REGISTRY } = require("./constants");
const { resolveProductDestination } = require("./urls");

// Structural adapter for each partner. Feed import and affiliate links work
// today; `officialApi` stays false until official partner access is granted
// and an implementation is added here. No credentials are ever invented.
function getAdapter(partnerKey) {
  const meta = PARTNER_REGISTRY[String(partnerKey || "").toLowerCase()];
  if (!meta) return null;

  return {
    key: meta.key,
    name: meta.name,
    homepage: meta.websiteUrl,
    supports: {
      productFeed: true,
      affiliateLinks: true,
      officialApi: false,
      signedWebhooks: true,
    },
    destinationFor: (product) => resolveProductDestination(product),
  };
}

function liveIntegrationStatus(partnerKey, integrationStatus) {
  const adapter = getAdapter(partnerKey);
  if (!adapter) {
    return { available: false, reason: "Unknown partner" };
  }
  if (integrationStatus !== "live") {
    return {
      available: false,
      reason: "Partner is in demo mode. Enable live mode only after official access is granted.",
    };
  }
  if (!adapter.supports.officialApi) {
    return {
      available: false,
      reason:
        "Live API connectivity is not implemented yet. Use an approved product feed, or add the official API adapter when access is granted.",
    };
  }
  return { available: true, reason: "" };
}

module.exports = {
  getAdapter,
  liveIntegrationStatus,
};
