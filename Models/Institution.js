const mongoose = require("mongoose");

// Configurable institutions for future campaigns (OAU, UI, UNILAG, ABU, ...)
const institutionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Institution name is required"],
    trim: true,
  },
  code: {
    type: String,
    required: [true, "Institution code is required"],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  location: {
    type: String,
    trim: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports =
  mongoose.models.Institution ||
  mongoose.model("Institution", institutionSchema);