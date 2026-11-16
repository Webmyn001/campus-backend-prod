// Illustrative catalogue entries used while a partner integration is in demo
// mode. They deliberately carry NO price, discount or stock figures so the
// platform never invents partner data. The UI labels anything with
// source === "demo" as a demo listing.

const PLACEHOLDER_IMAGE = "https://campuscrave.com.ng/placeholder.svg";

const DEMO_CAMPAIGN_NAME = "Demo Partner Preview";

function buildCatalog(partner, products) {
  return products.map((item, index) => ({
    partner,
    externalId: `demo-${partner}-${index + 1}`,
    source: "demo",
    title: item.title,
    description: item.description,
    category: item.category,
    tags: item.tags || [],
    imageUrl: PLACEHOLDER_IMAGE,
    images: [],
    currency: "NGN",
    price: null,
    originalPrice: null,
    availability: "unknown",
    priceVerifiedAt: null,
    priceSource: "demo",
    productUrl: item.productUrl,
    affiliateUrl: "",
    status: "published",
    featured: index === 0,
    isDemo: true,
  }));
}

const DEMO_CATALOG = {
  jumia: buildCatalog("jumia", [
    {
      title: "Demo: Everyday Wireless Earbuds",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Jumia product page after clicking Shop Now.",
      category: "Electronics",
      tags: ["audio", "accessories"],
      productUrl: "https://www.jumia.com.ng/",
    },
    {
      title: "Demo: Compact Blender",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Jumia product page after clicking Shop Now.",
      category: "Home & Kitchen",
      tags: ["appliances", "kitchen"],
      productUrl: "https://www.jumia.com.ng/",
    },
    {
      title: "Demo: Student Laptop Backpack",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Jumia product page after clicking Shop Now.",
      category: "Fashion",
      tags: ["bags", "campus"],
      productUrl: "https://www.jumia.com.ng/",
    },
    {
      title: "Demo: LED Desk Lamp",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Jumia product page after clicking Shop Now.",
      category: "Home & Office",
      tags: ["study", "lighting"],
      productUrl: "https://www.jumia.com.ng/",
    },
  ]),
  temu: buildCatalog("temu", [
    {
      title: "Demo: Reusable Storage Bags",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Temu product page after clicking Shop Now.",
      category: "Home & Kitchen",
      tags: ["storage", "organisation"],
      productUrl: "https://www.temu.com/",
    },
    {
      title: "Demo: Phone Camera Lens Kit",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Temu product page after clicking Shop Now.",
      category: "Electronics",
      tags: ["mobile", "accessories"],
      productUrl: "https://www.temu.com/",
    },
    {
      title: "Demo: Desk Organiser Set",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Temu product page after clicking Shop Now.",
      category: "Home & Office",
      tags: ["study", "organisation"],
      productUrl: "https://www.temu.com/",
    },
    {
      title: "Demo: Rechargeable Mini Fan",
      description:
        "Demo preview entry. Price, availability and offers are shown on the Temu product page after clicking Shop Now.",
      category: "Electronics",
      tags: ["cooling", "campus"],
      productUrl: "https://www.temu.com/",
    },
  ]),
};

module.exports = {
  DEMO_CATALOG,
  DEMO_CAMPAIGN_NAME,
};
