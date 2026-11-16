const express = require("express");
const router = express.Router();
const {
    fetchJobsFromAPI,
    getApprovedJobs,
    getPendingJobs,
    updateJobStatus,
    editJob,
    deleteJob,
    createManualJob,
    trackJobView
} = require("../Controller/jobController");
const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");
const rateLimit = require("../Middleware/rateLimit");

const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, prefix: "job-track" });

// Public Routes
router.get("/approved", getApprovedJobs);
router.post("/track-view/:id", trackLimiter, trackJobView);

// Admin Routes
router.get("/pending", authMiddleware, adminMiddleware, getPendingJobs);
router.post("/manual", authMiddleware, adminMiddleware, createManualJob);
router.put("/status/:id", authMiddleware, adminMiddleware, updateJobStatus);
router.put("/edit/:id", authMiddleware, adminMiddleware, editJob);
router.delete("/:id", authMiddleware, adminMiddleware, deleteJob);

// Manual trigger for job fetching (admin only; scheduled sync uses /api/cron/sync-jobs)
router.get("/sync", authMiddleware, adminMiddleware, fetchJobsFromAPI);

module.exports = router;
