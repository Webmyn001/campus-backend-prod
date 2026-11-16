const { PARTNER_MODES, MODE_PARTNERS, PARTNER_REGISTRY } = require("./constants");

function partnersForMode(mode) {
  return MODE_PARTNERS[mode] || [];
}

function modeAllowsPartner(mode, partnerKey) {
  return partnersForMode(mode).includes(String(partnerKey || "").toLowerCase());
}

function normalizeMode(mode) {
  const value = String(mode || "").trim().toUpperCase();
  return PARTNER_MODES.includes(value) ? value : null;
}

function partnerMeta(key) {
  return PARTNER_REGISTRY[String(key || "").toLowerCase()] || null;
}

module.exports = {
  partnersForMode,
  modeAllowsPartner,
  normalizeMode,
  partnerMeta,
};
