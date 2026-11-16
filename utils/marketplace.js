// Server-side marketplace money logic. All financial calculations MUST live
// here so that the backend never trusts the frontend for prices/fees/payouts.
const crypto = require("crypto");

const PLATFORM_COMMISSION_RATE = 0.03; // 3% of selling price
const FREE_FEE_THRESHOLD = 3000; // items below ₦3,000 are sold with no platform fee

function roundToKobo(n) {
  return Math.round(n * 100) / 100;
}

// priceAmount is the item's selling price in NGN.
// Items from ₦3,000 upward pay 3%; cheaper items are fee-free.
function computePlatformFee(priceAmount) {
  const price = Number(priceAmount) || 0;
  if (price < FREE_FEE_THRESHOLD) return 0;
  return roundToKobo(price * PLATFORM_COMMISSION_RATE);
}

function computeSellerAmount(priceAmount) {
  const price = Number(priceAmount) || 0;
  return roundToKobo(price - computePlatformFee(price));
}

function computeOrderTotal(priceAmount, deliveryFee) {
  const price = Number(priceAmount) || 0;
  const fee = Number(deliveryFee) || 0;
  return roundToKobo(price + fee);
}

function toKobo(amountNgn) {
  return Math.round((Number(amountNgn) || 0) * 100);
}

// Unique, collision-resistant reference used as an idempotency key
function generateReference(prefix = "FP") {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}_${stamp}_${rand}`;
}

function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `ORDER-${stamp}${rand}`;
}

module.exports = {
  PLATFORM_COMMISSION_RATE,
  FREE_FEE_THRESHOLD,
  roundToKobo,
  computePlatformFee,
  computeSellerAmount,
  computeOrderTotal,
  toKobo,
  generateReference,
  generateOrderNumber,
};