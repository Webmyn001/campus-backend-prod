// Usage: node scripts/renameUsername.js <userId> <newUsername> [--apply]
// Without --apply it only reports what would change. Also lists other website-style usernames.
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../Models/User");
const { escapeRegex, isObjectId } = require("../utils/security");
const { looksLikeWebsite } = require("../utils/username");

const [userId, newUsername] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");

async function run() {
  if (!isObjectId(userId) || !newUsername) {
    throw new Error("Usage: node scripts/renameUsername.js <userId> <newUsername> [--apply]");
  }
  if (!/^[a-z0-9._-]{3,30}$/i.test(newUsername) || looksLikeWebsite(newUsername)) {
    throw new Error(`"${newUsername}" is not a valid store username`);
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findById(userId).select("name username");
  if (!user) throw new Error(`No user with id ${userId}`);

  const taken = await User.findOne({
    _id: { $ne: user._id },
    username: { $regex: new RegExp(`^${escapeRegex(newUsername)}$`, "i") },
  }).select("_id");
  if (taken) throw new Error(`"${newUsername}" is already taken by ${taken._id}`);

  console.log(`${user.name}: ${user.username || "(none)"} -> ${newUsername}`);

  const others = await User.find({ username: { $exists: true, $ne: "" } }).select("name username").lean();
  const flagged = others.filter((u) => looksLikeWebsite(u.username) && String(u._id) !== userId);
  console.log(`Other website-style usernames: ${flagged.length}`);
  for (const u of flagged) console.log(`  ${u._id}  ${u.username}  (${u.name})`);

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to save.");
  } else {
    await User.updateOne({ _id: user._id }, { $set: { username: newUsername } });
    console.log("Saved.");
  }
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect();
  process.exit(1);
});
