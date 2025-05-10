const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  scam: {
    type: String,
    required: true,
  },
  Description: {
    type: String,
    required: true
  },
  contactInfo: {
    type: String,
  },
  image: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the created date
  },
});

const Report = mongoose.model("Report", reportSchema);
module.exports = Report;