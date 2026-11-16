const test = require("node:test");
const assert = require("node:assert/strict");

const PartnerProduct = require("../Models/PartnerProduct");
const PartnerSetting = require("../Models/PartnerSetting");
const PartnerCampaign = require("../Models/PartnerCampaign");
const PartnerClick = require("../Models/PartnerClick");
const PartnerConversion = require("../Models/PartnerConversion");

test("partner setting defaults to DISABLED", () => {
  const setting = new PartnerSetting({});
  assert.equal(setting.mode, "DISABLED");
  assert.equal(setting.validateSync(), undefined);
  assert.equal(new PartnerSetting({ mode: "PAYSTACK" }).validateSync().errors.mode != null, true);
});

test("demo partner products carry no price and validate", () => {
  const demo = new PartnerProduct({
    partner: "jumia",
    externalId: "demo-jumia-1",
    source: "demo",
    title: "Demo: Wireless Earbuds",
    category: "Electronics",
    status: "published",
    price: null,
    availability: "unknown",
    priceSource: "demo",
    productUrl: "https://www.jumia.com.ng/",
  });

  assert.equal(demo.validateSync(), undefined);
  assert.equal(demo.price, null);
  assert.equal(demo.availability, "unknown");
});

test("partner products require partner, externalId, title and category", () => {
  const invalid = new PartnerProduct({});
  const errors = invalid.validateSync().errors;
  assert.ok(errors.partner);
  assert.ok(errors.externalId);
  assert.ok(errors.title);
  assert.ok(errors.category);
});

test("partner product partner/source values are constrained", () => {
  const invalid = new PartnerProduct({
    partner: "amazon",
    externalId: "x",
    source: "scraped",
    title: "x",
    category: "x",
  });
  const errors = invalid.validateSync().errors;
  assert.ok(errors.partner);
  assert.ok(errors.source);
});

test("partner campaigns require a valid partner and name", () => {
  const campaign = new PartnerCampaign({
    partner: "temu",
    name: "Back to Campus",
  });
  assert.equal(campaign.validateSync(), undefined);
  assert.equal(campaign.status, "draft");

  const invalid = new PartnerCampaign({ partner: "ebay" });
  const errors = invalid.validateSync().errors;
  assert.ok(errors.partner);
  assert.ok(errors.name);
});

test("clicks require a destination and a valid partner", () => {
  const click = new PartnerClick({
    clickId: "a".repeat(32),
    partner: "temu",
    productId: "507f1f77bcf86cd799439011",
    destinationUrl: "https://www.temu.com/",
  });
  assert.equal(click.validateSync(), undefined);

  const invalid = new PartnerClick({ clickId: "b".repeat(32), partner: "aliexpress" });
  const errors = invalid.validateSync().errors;
  assert.ok(errors.partner);
  assert.ok(errors.productId);
  assert.ok(errors.destinationUrl);
});

test("conversions require an external order id and an authorised source", () => {
  const conversion = new PartnerConversion({
    partner: "jumia",
    externalOrderId: "JUM-1001",
    status: "confirmed",
    source: "partner_webhook",
    commissionAmount: 250,
  });
  assert.equal(conversion.validateSync(), undefined);
  assert.equal(conversion.commissionAmount, 250);

  const missingSource = new PartnerConversion({
    partner: "jumia",
    externalOrderId: "JUM-1002",
    status: "confirmed",
  });
  assert.ok(missingSource.validateSync().errors.source);

  const badSource = new PartnerConversion({
    partner: "jumia",
    externalOrderId: "JUM-1003",
    source: "click",
  });
  assert.ok(badSource.validateSync().errors.source);
});

test("negative commission amounts are rejected", () => {
  const invalid = new PartnerConversion({
    partner: "temu",
    externalOrderId: "TEMU-1",
    source: "partner_report",
    commissionAmount: -5,
  });
  assert.ok(invalid.validateSync().errors.commissionAmount);
});
