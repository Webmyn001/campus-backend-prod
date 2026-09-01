// Seeds configurable institutions (OAU, UI, UNILAG, ABU, ...) and the first
// OAU Final-Year Quick Sale campaign.
//
// Usage: node scripts/seedInstitutionCampaign.js
// Safe to re-run (idempotent per institution code / campaign name).

require("dotenv").config();
const mongoose = require("mongoose");
const Institution = require("../Models/Institution");
const Campaign = require("../Models/Campaign");

const INSTITUTIONS = [
  { name: "Obafemi Awolowo University", code: "OAU", location: "Ile-Ife, Osun State" },
  { name: "University of Ibadan", code: "UI", location: "Ibadan, Oyo State" },
  { name: "University of Lagos", code: "UNILAG", location: "Akoka, Lagos" },
  { name: "Ahmadu Bello University", code: "ABU", location: "Zaria, Kaduna State" },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  // 1. Institutions
  const createdInstitutions = [];
  for (const inst of INSTITUTIONS) {
    const existing = await Institution.findOne({ code: inst.code });
    if (existing) {
      createdInstitutions.push(existing);
      console.log(`⏭ Institution ${inst.code} already exists`);
    } else {
      const created = await Institution.create(inst);
      createdInstitutions.push(created);
      console.log(`✅ Created institution ${inst.code}`);
    }
  }

  // 2. OAU Final-Year Quick Sale campaign (active: 2 months ago -> 6 weeks from now)
  const oau = createdInstitutions.find((i) => i.code === "OAU");
  const existingCampaign = await Campaign.findOne({ name: "OAU Final-Year Quick Sale" });
  if (existingCampaign) {
    console.log("⏭ Campaign already exists:", existingCampaign.name);
  } else {
    const start = new Date();
    start.setDate(start.getDate() - 60);
    const end = new Date();
    end.setDate(end.getDate() + 45);

    await Campaign.create({
      name: "OAU Final-Year Quick Sale",
      institutionId: oau._id,
      institutionCode: "OAU",
      institutionName: oau.name,
      saleType: "final_year",
      tagline: "Graduating? Turn Your Campus Belongings Into Cash.",
      description:
        "Sell furniture, appliances, electronics, bags, hostel items and more to students who are still on campus.",
      startDate: start,
      endDate: end,
      status: "active",
    });
    console.log("✅ Created OAU Final-Year Quick Sale campaign");
  }

  await mongoose.disconnect();
  console.log("🎉 Seed complete.");
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});