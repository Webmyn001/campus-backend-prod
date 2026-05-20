const mongoose = require("mongoose");

const bulkEmailQueueSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
  },
  attempts: { type: Number, default: 0 },
  lastError: { type: String },
  lastAttemptAt: { type: Date },
  sentAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("BulkEmailQueue", bulkEmailQueueSchema);
