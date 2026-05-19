const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema({
  date: {
    type: String, // format: YYYY-MM-DD
    required: true,
    index: true,
  },
  ipHash: {
    type: String,
    required: true,
    index: true,
  },
}, { timestamps: true });

// Compound unique index to prevent double counting the same visitor on a single day
visitSchema.index({ date: 1, ipHash: 1 }, { unique: true });

const Visit = mongoose.model("Visit", visitSchema);

module.exports = Visit;
