const { isHttpsUrl } = require("./security");

const CANONICAL_CLIENT_URL = "https://campuscrave.com.ng";
const LEGACY_HOSTS = new Set(["campuscrave.ng", "www.campuscrave.ng"]);

// Keeps emailed links on the current domain even if CLIENT_URL still holds the old one.
function clientBaseUrl() {
  const configured = String(process.env.CLIENT_URL || "").trim().replace(/\/+$/, "");
  if (!isHttpsUrl(configured)) return CANONICAL_CLIENT_URL;

  const { hostname } = new URL(configured);
  if (LEGACY_HOSTS.has(hostname.toLowerCase())) return CANONICAL_CLIENT_URL;

  return configured;
}

module.exports = { clientBaseUrl, CANONICAL_CLIENT_URL };
