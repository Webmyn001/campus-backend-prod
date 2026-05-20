const express = require("express");
const router = express.Router();
const { runWeeklyAnalyticsJob } = require("../jobs/weeklyAnalyticsEmail");
const { fetchJobsFromAPI } = require("../Controller/jobController");
const { processBulkEmailQueue } = require("../jobs/bulkEmailQueue");

// GET /api/cron/weekly-analytics
router.get("/weekly-analytics", async (req, res) => {
    try {
        console.log("🔔 Vercel Cron triggered: Weekly Analytics");

        // Basic security check: Vercel sends a specific header if you set up CRON_SECRET
        const authHeader = req.headers['authorization'];
        const cronSecret = process.env.CRON_SECRET;

        const force = req.query.force === 'true';
        await runWeeklyAnalyticsJob(force);

        res.status(200).json({ 
            success: true, 
            message: force ? "Weekly analytics job FORCED successfully." : "Weekly analytics job processed." 
        });
    } catch (err) {
        console.error("❌ Cron Route Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/cron/sync-jobs
router.get("/sync-jobs", async (req, res) => {
    try {
        console.log("🔔 Vercel Cron triggered: Job Sync");
        await fetchJobsFromAPI(null, null); // Run logic without req/res objects for cron
        res.status(200).json({ success: true, message: "Job sync initiated." });
    } catch (err) {
        console.error("❌ Job Sync Cron Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get("/bulk-email-daily", async (req, res) => {
    try {
        const authHeader = req.headers["authorization"];
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ success: false, message: "Invalid cron authorization." });
        }

        console.log("🔔 Vercel Cron triggered: Daily Bulk Email Processing");

        const result = await processBulkEmailQueue();
        res.status(200).json({ success: true, message: "Bulk email queue processed.", result });
    } catch (err) {
        console.error("❌ Bulk Email Cron Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
