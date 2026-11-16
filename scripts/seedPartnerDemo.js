/* Seeds partner registry docs, a demo campaign and demo catalogue entries.
 * Demo entries carry no price/availability data and are clearly marked.
 * The partner mode is never changed here — keep it DISABLED until the admin
 * enables a partner from the dashboard.
 *
 * Usage: npm run seed:partner-demo
 */
require("dotenv").config();
const mongoose = require("mongoose");

const Partner = require("../Models/Partner");
const PartnerSetting = require("../Models/PartnerSetting");
const PartnerProduct = require("../Models/PartnerProduct");
const PartnerCampaign = require("../Models/PartnerCampaign");
const { PARTNER_REGISTRY } = require("../services/partners/constants");
const { DEMO_CATALOG, DEMO_CAMPAIGN_NAME } = require("../services/partners/demoCatalog");

async function seed() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  await PartnerSetting.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { mode: "DISABLED" } },
    { upsert: true }
  );

  for (const meta of Object.values(PARTNER_REGISTRY)) {
    await Partner.findOneAndUpdate(
      { key: meta.key },
      {
        $setOnInsert: {
          key: meta.key,
          name: meta.name,
          websiteUrl: meta.websiteUrl,
          integrationStatus: "demo",
        },
      },
      { upsert: true }
    );

    let campaign = await PartnerCampaign.findOne({
      partner: meta.key,
      name: DEMO_CAMPAIGN_NAME,
    });
    if (!campaign) {
      campaign = await PartnerCampaign.create({
        partner: meta.key,
        name: DEMO_CAMPAIGN_NAME,
        description:
          "Demo preview campaign. Prices and availability are shown on the partner site.",
        status: "active",
      });
    }

    let created = 0;
    for (const item of DEMO_CATALOG[meta.key] || []) {
      const exists = await PartnerProduct.findOne({
        partner: meta.key,
        externalId: item.externalId,
      });
      if (!exists) {
        await PartnerProduct.create({ ...item, campaignId: campaign._id });
        created += 1;
      }
    }

    console.log(`${meta.name}: ${created} demo product(s) created`);
  }

  console.log("Demo seed complete. Partner mode remains DISABLED until an admin enables it.");
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error("Seed failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
