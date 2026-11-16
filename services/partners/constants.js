const PARTNER_MODES = ["DISABLED", "JUMIA", "TEMU", "BOTH"];

const MODE_PARTNERS = {
  DISABLED: [],
  JUMIA: ["jumia"],
  TEMU: ["temu"],
  BOTH: ["jumia", "temu"],
};

// Static registry. Nothing here is invented partner data — only the publicly
// known storefronts and the hostnames their approved links may use.
const PARTNER_REGISTRY = {
  jumia: {
    key: "jumia",
    name: "Jumia",
    websiteUrl: "https://www.jumia.com.ng/",
    hosts: ["jumia.com.ng", "jumia.com"],
    webhookSignatureHeader: "x-jumia-signature",
  },
  temu: {
    key: "temu",
    name: "Temu",
    websiteUrl: "https://www.temu.com/",
    hosts: ["temu.com"],
    webhookSignatureHeader: "x-temu-signature",
  },
};

module.exports = {
  PARTNER_MODES,
  MODE_PARTNERS,
  PARTNER_REGISTRY,
};
