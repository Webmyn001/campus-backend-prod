const PartnerProduct = require("../Models/PartnerProduct");
const { text } = require("../utils/listings");
const { signatureFromRequest, verifyPartnerSignature } = require("../services/partners/signatures");
const { recordConversion } = require("../services/partners/conversions");

const PARTNER_KEYS = ["jumia", "temu"];
const SUPPORTED_EVENTS = {
  "conversion.confirmed": "confirmed",
  "conversion.rejected": "rejected",
  "order.confirmed": "confirmed",
  "order.rejected": "rejected",
};

function normalizeCurrency(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function toAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

exports.handlePartnerWebhook = async (req, res) => {
  const partner = String(req.params.partner || "").toLowerCase();
  if (!PARTNER_KEYS.includes(partner)) {
    return res.status(404).json({ success: false, message: "Unknown partner" });
  }

  const signature = signatureFromRequest(req, partner);
  const verdict = verifyPartnerSignature(partner, req.rawBody, signature);

  if (!verdict.configured) {
    console.error(`Partner webhook rejected: no secret configured for ${partner}`);
    return res.status(503).json({
      success: false,
      message: "Webhook verification is not configured for this partner",
    });
  }
  if (!verdict.ok) {
    console.error(`Partner webhook rejected: invalid signature for ${partner}`);
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }

  const payload = req.body || {};
  const type = payload.type || payload.event;
  if (typeof type !== "string" || !type) {
    return res.status(400).json({ success: false, message: "Missing event type" });
  }

  const status = SUPPORTED_EVENTS[type];
  if (!status) {
    return res.status(200).json({ success: true, received: true, ignored: true });
  }

  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const externalOrderId = text(data.externalOrderId || data.orderId, 200);
  if (!externalOrderId) {
    return res.status(400).json({ success: false, message: "externalOrderId is required" });
  }

  const orderAmount = toAmount(data.orderAmount ?? data.amount);
  const commissionAmount = toAmount(data.commissionAmount ?? data.commission);
  if (orderAmount === undefined || commissionAmount === undefined) {
    return res.status(400).json({ success: false, message: "Invalid amount" });
  }

  const currency = normalizeCurrency(data.currency) || "NGN";
  const commissionCurrency = normalizeCurrency(data.commissionCurrency) || currency;
  const productExternalId = text(data.productExternalId, 200);

  try {
    if (productExternalId) {
      const product = await PartnerProduct.findOne({
        partner,
        externalId: productExternalId,
      })
        .select("source")
        .lean();
      if (product && product.source === "demo") {
        return res.status(200).json({
          success: true,
          received: true,
          ignored: true,
          reason: "Demo products do not accept conversions",
        });
      }
    }

    const outcome = await recordConversion({
      partner,
      externalOrderId,
      status,
      source: "partner_webhook",
      clickId:
        typeof data.clickId === "string" && data.clickId.length <= 100 ? data.clickId : null,
      productExternalId,
      orderAmount,
      currency,
      commissionAmount,
      commissionCurrency,
      confirmedAt: status === "confirmed" ? new Date() : null,
    });

    return res.status(200).json({
      success: true,
      received: true,
      duplicate: !outcome.created,
    });
  } catch (error) {
    console.error("Partner Webhook Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to record webhook" });
  }
};
