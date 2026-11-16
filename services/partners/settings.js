const PartnerSetting = require("../../Models/PartnerSetting");
const Partner = require("../../Models/Partner");
const { PARTNER_REGISTRY } = require("./constants");
const { normalizeMode, partnersForMode } = require("./registry");

async function getPartnerMode() {
  const doc = await PartnerSetting.findOne({ key: "global" }).lean();
  return normalizeMode(doc?.mode) || "DISABLED";
}

async function setPartnerMode(mode, userId) {
  const normalized = normalizeMode(mode);
  if (!normalized) {
    const error = new Error("Invalid partner mode");
    error.code = "INVALID_MODE";
    throw error;
  }

  const doc = await PartnerSetting.findOneAndUpdate(
    { key: "global" },
    { $set: { mode: normalized, ...(userId ? { updatedBy: userId } : {}) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc.mode;
}

async function enabledPartnerKeys() {
  return partnersForMode(await getPartnerMode());
}

async function isPartnerEnabled(partnerKey) {
  const keys = await enabledPartnerKeys();
  return keys.includes(String(partnerKey || "").toLowerCase());
}

// Static registry merged with the admin-editable override document. Reading
// never writes to the database.
async function listPartnersWithStatus() {
  let overrides = [];
  try {
    overrides = await Partner.find({}).lean();
  } catch (error) {
    overrides = [];
  }

  const byKey = {};
  for (const doc of overrides) byKey[doc.key] = doc;

  return Object.values(PARTNER_REGISTRY).map((meta) => {
    const doc = byKey[meta.key];
    return {
      key: meta.key,
      name: meta.name,
      websiteUrl: meta.websiteUrl,
      integrationStatus: doc?.integrationStatus === "live" ? "live" : "demo",
      affiliateProgramName: doc?.affiliateProgramName || "",
      notes: doc?.notes || "",
      webhookSignatureHeader: meta.webhookSignatureHeader,
      allowedHosts: meta.hosts,
    };
  });
}

module.exports = {
  getPartnerMode,
  setPartnerMode,
  enabledPartnerKeys,
  isPartnerEnabled,
  listPartnersWithStatus,
};
