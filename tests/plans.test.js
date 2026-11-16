const test = require("node:test");
const assert = require("node:assert/strict");
const { getPlan, getPlanPriceKobo, getValidityDays, expiryFromNow } = require("../utils/plans");

for (const key of ["PLAN_PRICE_PREMIUM", "PLAN_PRICE_PREMIUM6M", "PLAN_PRICE_STANDARD", "PLAN_PRICE_STARTER"]) {
  delete process.env[key];
}

test("premium plan is purchasable at the checkout price", () => {
  const plan = getPlan("premium");
  assert.equal(plan.priceNgn, 1500);
  assert.equal(plan.purchasable, true);
  assert.equal(getPlanPriceKobo("premium"), 150000);
  assert.equal(getValidityDays("premium"), 30);
});

test("six-month plan reflects the discounted total", () => {
  assert.equal(getPlanPriceKobo("premium6m"), 700000);
  assert.equal(getValidityDays("premium6m"), 180);
});

test("starter is free and not purchasable via Paystack", () => {
  const plan = getPlan("starter");
  assert.equal(plan.priceNgn, 0);
  assert.equal(plan.purchasable, false);
  assert.equal(getPlanPriceKobo("starter"), null);
});

test("unknown plans are rejected", () => {
  assert.equal(getPlan("gold"), null);
  assert.equal(getPlan(undefined), null);
  assert.equal(getPlanPriceKobo("gold"), null);
  assert.equal(getValidityDays("gold"), null);
});

test("expiry is calculated from the plan validity", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const expiry = expiryFromNow("premium", start);
  assert.equal(expiry.toISOString(), "2026-01-31T00:00:00.000Z");
  assert.equal(expiryFromNow("gold", start), null);
});
