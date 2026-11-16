const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedPartnerUrl, resolveProductDestination, allowedHosts } = require("../services/partners/urls");
const {
  partnersForMode,
  modeAllowsPartner,
  normalizeMode,
} = require("../services/partners/registry");
const { signPayload, verifyPartnerSignature } = require("../services/partners/signatures");

test("only approved partner hosts are accepted", () => {
  assert.equal(isAllowedPartnerUrl("jumia", "https://www.jumia.com.ng/catalog/"), true);
  assert.equal(isAllowedPartnerUrl("jumia", "https://jumia.com/some-product"), true);
  assert.equal(isAllowedPartnerUrl("temu", "https://www.temu.com/ng/some-goods.html"), true);

  assert.equal(isAllowedPartnerUrl("jumia", "http://www.jumia.com.ng/"), false);
  assert.equal(isAllowedPartnerUrl("jumia", "https://jumia.com.ng.evil.example/"), false);
  assert.equal(isAllowedPartnerUrl("jumia", "https://evil.example/jumia.com.ng"), false);
  assert.equal(isAllowedPartnerUrl("temu", "https://www.jumia.com.ng/"), false);
  assert.equal(isAllowedPartnerUrl("temu", "https://user:pass@www.temu.com/"), false);
});

test("extra allowed hosts can be configured per partner", () => {
  process.env.PARTNER_ALLOWED_HOSTS_JUMIA = "affiliate.jumia.example";
  assert.equal(isAllowedPartnerUrl("jumia", "https://affiliate.jumia.example/go/123"), true);
  assert.ok(allowedHosts("jumia").includes("affiliate.jumia.example"));
  delete process.env.PARTNER_ALLOWED_HOSTS_JUMIA;
});

test("destination prefers an approved affiliate link", () => {
  assert.equal(
    resolveProductDestination({
      partner: "jumia",
      affiliateUrl: "https://www.jumia.com.ng/aff/123",
      productUrl: "https://www.jumia.com.ng/product",
    }),
    "https://www.jumia.com.ng/aff/123"
  );

  assert.equal(
    resolveProductDestination({
      partner: "jumia",
      affiliateUrl: "https://evil.example/123",
      productUrl: "https://www.jumia.com.ng/product",
    }),
    "https://www.jumia.com.ng/product"
  );

  assert.equal(resolveProductDestination({ partner: "temu" }), "https://www.temu.com/");
});

test("partner mode maps to the enabled partners", () => {
  assert.deepEqual(partnersForMode("DISABLED"), []);
  assert.deepEqual(partnersForMode("JUMIA"), ["jumia"]);
  assert.deepEqual(partnersForMode("TEMU"), ["temu"]);
  assert.deepEqual(partnersForMode("BOTH"), ["jumia", "temu"]);
  assert.deepEqual(partnersForMode("bogus"), []);

  assert.equal(modeAllowsPartner("JUMIA", "jumia"), true);
  assert.equal(modeAllowsPartner("JUMIA", "temu"), false);
  assert.equal(modeAllowsPartner("BOTH", "temu"), true);
});

test("mode normalisation rejects unknown values", () => {
  assert.equal(normalizeMode("both"), "BOTH");
  assert.equal(normalizeMode("TEMU"), "TEMU");
  assert.equal(normalizeMode("JUMIA "), "JUMIA");
  assert.equal(normalizeMode("paystack"), null);
  assert.equal(normalizeMode(""), null);
});

test("partner webhooks are rejected when no secret is configured", () => {
  delete process.env.JUMIA_WEBHOOK_SECRET;
  const verdict = verifyPartnerSignature("jumia", Buffer.from("{}"), "anything");
  assert.equal(verdict.ok, false);
  assert.equal(verdict.configured, false);
});

test("partner webhook signatures are verified against the raw body", () => {
  process.env.JUMIA_WEBHOOK_SECRET = "unit-test-secret";
  const body = Buffer.from(JSON.stringify({ type: "conversion.confirmed" }));
  const signature = signPayload("unit-test-secret", body);

  assert.equal(verifyPartnerSignature("jumia", body, signature).ok, true);
  assert.equal(verifyPartnerSignature("jumia", body, `sha256=${signature}`).ok, true);
  assert.equal(verifyPartnerSignature("jumia", body, "deadbeef").ok, false);
  assert.equal(verifyPartnerSignature("jumia", Buffer.from("{}"), signature).ok, false);
  assert.equal(verifyPartnerSignature("jumia", body, "").ok, false);

  delete process.env.JUMIA_WEBHOOK_SECRET;
});
