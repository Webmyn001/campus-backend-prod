const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  scamType: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true
  },
  contactInfo: {
    type: String,
  },
 
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the created date
  },
});

const Report = mongoose.model("Report", reportSchema);
module.exports = Report;