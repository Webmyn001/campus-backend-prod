const express = require("express");
const router = express.Router();
const { runWeeklyAnalyticsJob } = require("../jobs/weeklyAnalyticsEmail");
const { fetchJobsFromAPI } = require("../Controller/jobController");
const { processBulkEmailQueue } = require("../jobs/bulkEmailQueue");
const requireCronSecret = require("../Middleware/cronAuth");

// Every cron endpoint is protected. CRON_SECRET must be configured, and the
// caller must send it as a Bearer token (Vercel Cron does this automatically)
// or via the x-cron-secret header.
router.use(requireCronSecret);

// GET /api/cron/weekly-analytics
router.get("/weekly-analytics", async (req, res) => {
  try {
    console.log("Vercel Cron triggered: Weekly Analytics");
    const force = req.query.force === "true";
    await runWeeklyAnalyticsJob(force);

    res.status(200).json({
      success: true,
      message: force
        ? "Weekly analytics job FORCED successfully."
        : "Weekly analytics job processed.",
    });
  } catch (err) {
    console.error("Cron Route Error:", err.message);
    res.status(500).json({ success: false, message: "Cron job failed." });
  }
});

// GET /api/cron/sync-jobs
router.get("/sync-jobs", async (req, res) => {
  try {
    console.log("Vercel Cron triggered: Job Sync");
    await fetchJobsFromAPI(null, null);
    res.status(200).json({ success: true, message: "Job sync initiated." });
  } catch (err) {
    console.error("Job Sync Cron Error:", err.message);
    res.status(500).json({ success: false, message: "Cron job failed." });
  }
});

// GET /api/cron/bulk-email-daily
router.get("/bulk-email-daily", async (req, res) => {
  try {
    console.log("Vercel Cron triggered: Daily Bulk Email Processing");
    const result = await processBulkEmailQueue();
    res.status(200).json({ success: true, message: "Bulk email queue processed.", result });
  } catch (err) {
    console.error("Bulk Email Cron Error:", err.message);
    res.status(500).json({ success: false, message: "Cron job failed." });
  }
});

module.exports = router;
