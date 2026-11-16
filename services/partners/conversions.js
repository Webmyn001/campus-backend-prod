const PartnerConversion = require("../../Models/PartnerConversion");
const PartnerClick = require("../../Models/PartnerClick");
const PartnerProduct = require("../../Models/PartnerProduct");

async function recordConversion(input) {
  let click = null;
  if (input.clickId) {
    click = await PartnerClick.findOne({ clickId: String(input.clickId) }).lean();
    if (click && click.partner !== input.partner) click = null;
  }

  let product = null;
  if (input.productId) {
    product = await PartnerProduct.findById(input.productId).lean();
  } else if (input.productExternalId) {
    product = await PartnerProduct.findOne({
      partner: input.partner,
      externalId: String(input.productExternalId),
    }).lean();
  }
  if (!product && click) {
    product = await PartnerProduct.findById(click.productId).lean();
  }
  if (product && product.partner !== input.partner) product = null;

  const doc = {
    partner: input.partner,
    externalOrderId: String(input.externalOrderId),
    status: input.status,
    source: input.source,
    productId: product ? product._id : null,
    campaignId: click?.campaignId || product?.campaignId || null,
    clickId: click ? click.clickId : null,
    orderAmount: input.orderAmount ?? null,
    currency: input.currency || "NGN",
    commissionAmount: input.commissionAmount ?? null,
    commissionCurrency: input.commissionCurrency || input.currency || "NGN",
    confirmedAt: input.confirmedAt || (input.status === "confirmed" ? new Date() : null),
    isDemo: product ? product.source === "demo" : false,
    recordedBy: input.recordedBy || null,
  };

  try {
    const conversion = await PartnerConversion.create(doc);
    return { created: true, conversion };
  } catch (error) {
    if (error.code === 11000) {
      return { created: false, duplicate: true };
    }
    throw error;
  }
}

module.exports = { recordConversion };
