require("dotenv").config();
const mongoose = require("mongoose");
const { parseLegacyPrice } = require("../utils/legacyPrice");

const APPLY = process.argv.includes("--apply");

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  await mongoose.connect(process.env.MONGO_URI);

  const query = { status: "approved", saleType: { $nin: ["final_year", "convocation"] } };
  // Read raw documents: Mongoose would hydrate the schema defaults for
  // listingState/quantity, hiding fields that are actually missing in the DB.
  const collection = mongoose.connection.db.collection("listings");
  const listings = await collection.find(query).toArray();

  const ops = [];
  const unpriced = [];
  let priceSet = 0;
  let stateSet = 0;
  let qtySet = 0;
  let totalNaira = 0;

  for (const l of listings) {
    const set = {};

    if (!(Number(l.priceAmount) > 0)) {
      const parsed = parseLegacyPrice(l.price);
      if (parsed > 0) {
        set.priceAmount = parsed;
        priceSet += 1;
      } else {
        unpriced.push({ id: String(l._id), title: l.title, price: l.price });
      }
    }

    if (l.soldOut === true) {
      if (l.listingState !== "sold") {
        set.listingState = "sold";
        stateSet += 1;
      }
    } else if (!l.listingState) {
      set.listingState = "active";
      stateSet += 1;
    }

    if (typeof l.quantity !== "number") {
      set.quantity = 1;
      qtySet += 1;
    }

    totalNaira += Number(set.priceAmount ?? l.priceAmount ?? 0);

    if (Object.keys(set).length > 0) {
      ops.push({ updateOne: { filter: { _id: l._id }, update: { $set: set } } });
    }
  }

  console.log(`Approved community listings scanned: ${listings.length}`);
  console.log(`Will set priceAmount: ${priceSet}`);
  console.log(`Will set listingState: ${stateSet}`);
  console.log(`Will set quantity: ${qtySet}`);
  console.log(`Listings still unpriced (stay chat-only): ${unpriced.length}`);
  console.log(`Total payable value after backfill: NGN ${totalNaira.toLocaleString()}`);
  if (unpriced.length) console.log("Unpriced:", JSON.stringify(unpriced.slice(0, 20), null, 2));

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write these changes.");
    await mongoose.disconnect();
    return;
  }

  if (ops.length) {
    const result = await collection.bulkWrite(ops, { ordered: false });
    console.log(`\nApplied: modified ${result.modifiedCount} listings.`);
  } else {
    console.log("\nNothing to change.");
  }
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Backfill failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
