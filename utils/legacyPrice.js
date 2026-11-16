// Legacy community listings stored the price as free text ("₦3,500", "9k").
// Paystack needs a number, so parse conservatively: anything ambiguous returns 0
// and the listing stays chat-only instead of being sold at a guessed price.
function parseLegacyPrice(raw) {
  if (raw === null || raw === undefined) return 0;
  let s = String(raw).trim().toLowerCase();
  if (!s) return 0;
  s = s.replace(/[\s,]/g, "").replace(/(naira|ngn)/g, "").replace(/^[₦n]+/, "");

  let multiplier = 1;
  if (/k$/.test(s)) {
    multiplier = 1000;
    s = s.replace(/k$/, "");
  }

  const n = Number(s);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n * multiplier * 100) / 100;
}

module.exports = { parseLegacyPrice };
