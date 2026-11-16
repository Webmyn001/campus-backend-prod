const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLegacyPrice } = require("../utils/legacyPrice");

test("parses plain and formatted naira prices", () => {
  assert.equal(parseLegacyPrice("3500"), 3500);
  assert.equal(parseLegacyPrice("₦3,500"), 3500);
  assert.equal(parseLegacyPrice(" 7000 "), 7000);
  assert.equal(parseLegacyPrice("NGN 13000"), 13000);
  assert.equal(parseLegacyPrice("3500 naira"), 3500);
  assert.equal(parseLegacyPrice("n8500"), 8500);
});

test("expands the k suffix", () => {
  assert.equal(parseLegacyPrice("9k"), 9000);
  assert.equal(parseLegacyPrice("₦9K"), 9000);
  assert.equal(parseLegacyPrice("9.5k"), 9500);
});

test("keeps decimals and rejects unpriced text", () => {
  assert.equal(parseLegacyPrice("3500.5"), 3500.5);
  assert.equal(parseLegacyPrice("0"), 0);
  assert.equal(parseLegacyPrice("negotiable"), 0);
  assert.equal(parseLegacyPrice(""), 0);
  assert.equal(parseLegacyPrice(null), 0);
  assert.equal(parseLegacyPrice(undefined), 0);
});
