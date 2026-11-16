const test = require("node:test");
const assert = require("node:assert/strict");

const mkt = require("../utils/marketplace");

test("platform fee is 3% from ₦3,000 upward", () => {
  assert.equal(mkt.computePlatformFee(3000), 90);
  assert.equal(mkt.computePlatformFee(10000), 300);
  assert.equal(mkt.computePlatformFee(50000), 1500);
});

test("platform fee is zero below ₦3,000", () => {
  assert.equal(mkt.computePlatformFee(2999), 0);
  assert.equal(mkt.computePlatformFee(1000), 0);
  assert.equal(mkt.computePlatformFee(150), 0);
  assert.equal(mkt.computePlatformFee(0), 0);
});

test("seller amount is the price minus the fee", () => {
  assert.equal(mkt.computeSellerAmount(10000), 9700);
  assert.equal(mkt.computeSellerAmount(3000), 2910);
  assert.equal(mkt.computeSellerAmount(1000), 1000);
});
