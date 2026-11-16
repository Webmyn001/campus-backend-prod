const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

// Route-level smoke tests. The database is stubbed so these run without a
// MongoDB instance; mode DISABLED is the default state.
const PartnerSetting = require("../Models/PartnerSetting");
const Partner = require("../Models/Partner");
const PartnerProduct = require("../Models/PartnerProduct");

PartnerSetting.findOne = () => ({ lean: async () => null });
Partner.find = () => ({ lean: async () => [] });
PartnerProduct.findOne = () => ({ lean: async () => null });

const partnerRoutes = require("../Routes/partnerRoutes");

const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use("/api/partner", partnerRoutes);

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  if (server) server.close();
});

test("config reports DISABLED and no enabled partners", async () => {
  const response = await fetch(`${base}/api/partner/config`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "DISABLED");
  assert.equal(body.enabled, false);
  assert.deepEqual(body.partners, []);
});

test("catalogue is empty while partner mode is disabled", async () => {
  const response = await fetch(`${base}/api/partner/products`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.enabled, false);
  assert.deepEqual(body.products, []);
  assert.deepEqual(body.categories, []);
  assert.equal(body.total, 0);
});

test("catalogue accepts known sort keys and rejects unknown ones", async () => {
  for (const sort of ["featured", "newest", "title_asc", "title_desc", "price_asc", "price_desc"]) {
    const response = await fetch(`${base}/api/partner/products?sort=${sort}`);
    assert.equal(response.status, 200, `sort=${sort}`);
  }

  const invalid = await fetch(`${base}/api/partner/products?sort=cheapest`);
  assert.equal(invalid.status, 400);
  const body = await invalid.json();
  assert.match(body.message, /sort/i);
});

test("banners are empty while partner mode is disabled", async () => {
  const response = await fetch(`${base}/api/partner/banners`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.enabled, false);
  assert.deepEqual(body.banners, []);
});

test("click endpoint rejects malformed product ids", async () => {
  const response = await fetch(`${base}/api/partner/click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "not-an-id" }),
  });
  assert.equal(response.status, 400);
});

test("click endpoint rejects products while partner mode is disabled", async () => {
  const response = await fetch(`${base}/api/partner/click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "507f1f77bcf86cd799439011" }),
  });
  assert.equal(response.status, 404);
});

test("redirect endpoint rejects malformed click ids", async () => {
  const response = await fetch(`${base}/api/partner/go/not-a-click`);
  assert.equal(response.status, 400);
});

test("webhook rejects an unknown partner", async () => {
  const response = await fetch(`${base}/api/partner/webhooks/ebay`, { method: "POST" });
  assert.equal(response.status, 404);
});

test("webhook fails closed when no secret is configured", async () => {
  delete process.env.JUMIA_WEBHOOK_SECRET;
  const response = await fetch(`${base}/api/partner/webhooks/jumia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-jumia-signature": "deadbeef" },
    body: JSON.stringify({ type: "conversion.confirmed" }),
  });
  assert.equal(response.status, 503);
});

test("webhook rejects an invalid signature", async () => {
  process.env.JUMIA_WEBHOOK_SECRET = "unit-test-secret";
  const response = await fetch(`${base}/api/partner/webhooks/jumia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-jumia-signature": "deadbeef" },
    body: JSON.stringify({ type: "conversion.confirmed" }),
  });
  assert.equal(response.status, 401);
  delete process.env.JUMIA_WEBHOOK_SECRET;
});
