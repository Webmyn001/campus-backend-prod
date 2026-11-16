// Server-side source of truth for subscription pricing and duration.
// Prices mirror the live checkout tiers; administrators can override them
// with PLAN_PRICE_* environment variables (amounts are whole Naira).
const DEFAULT_PRICES_NGN = {
  starter: 0,
  standard: null, // not offered in the current UI; must be configured explicitly
  premium: 1500,
  premium6m: 7000,
};

const PLAN_VALIDITY_DAYS = {
  starter: 1,
  standard: 30,
  premium: 30,
  premium6m: 180,
};

function readPriceEnv(plan) {
  const raw = process.env[`PLAN_PRICE_${plan.toUpperCase()}`];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function getPlan(name) {
  if (typeof name !== "string") return null;
  const plan = name.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PLAN_VALIDITY_DAYS, plan)) return null;

  const envPrice = readPriceEnv(plan);
  const priceNgn = envPrice !== undefined ? envPrice : DEFAULT_PRICES_NGN[plan];

  return {
    name: plan,
    validityDays: PLAN_VALIDITY_DAYS[plan],
    priceNgn,
    purchasable: typeof priceNgn === "number" && priceNgn > 0,
  };
}

function getPlanPriceKobo(name) {
  const plan = getPlan(name);
  if (!plan || !plan.purchasable) return null;
  return Math.round(plan.priceNgn * 100);
}

function getValidityDays(name) {
  const plan = getPlan(name);
  return plan ? plan.validityDays : null;
}

function expiryFromNow(planName, start = new Date()) {
  const days = getValidityDays(planName);
  if (!days) return null;
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

module.exports = {
  getPlan,
  getPlanPriceKobo,
  getValidityDays,
  expiryFromNow,
};
