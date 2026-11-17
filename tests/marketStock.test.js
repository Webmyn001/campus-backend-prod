const test = require("node:test");
const assert = require("node:assert/strict");
const { publicMarketFilter, listingStateAfterRestock } = require("../utils/listings");

test("public market hides unreviewed, rejected and out-of-stock listings", () => {
  const filter = publicMarketFilter();
  assert.deepEqual(filter.status, { $nin: ["pending", "rejected"] });
  assert.deepEqual(filter.soldOut, { $ne: true });
  assert.deepEqual(filter.quantity, { $not: { $lte: 0 } });
  assert.deepEqual(filter.listingState, { $nin: ["sold", "archived", "suspended"] });
});

test("public market does not filter by sale type or campaign", () => {
  const filter = publicMarketFilter();
  assert.equal(filter.saleType, undefined);
  assert.equal(filter.campaignId, undefined);
});

test("restocking a sold listing puts it back on sale", () => {
  assert.equal(listingStateAfterRestock("sold", 3), "active");
  assert.equal(listingStateAfterRestock("sold", "2"), "active");
});

test("restocking leaves other listing states alone", () => {
  assert.equal(listingStateAfterRestock("sold", 0), undefined);
  assert.equal(listingStateAfterRestock("active", 5), undefined);
  assert.equal(listingStateAfterRestock("suspended", 5), undefined);
  assert.equal(listingStateAfterRestock("archived", 5), undefined);
  assert.equal(listingStateAfterRestock(undefined, 5), undefined);
});
