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

// Public Routes
router.get("/approved", getApprovedJobs);
router.post("/track-view/:id", trackJobView);

// Admin Routes (Protected)
router.get("/pending", authMiddleware, getPendingJobs);
router.post("/manual", authMiddleware, createManualJob);
router.put("/status/:id", authMiddleware, updateJobStatus);
router.put("/edit/:id", authMiddleware, editJob);
router.delete("/:id", authMiddleware, deleteJob);

// Cron/Manual Trigger for Job Fetching
router.get("/sync", fetchJobsFromAPI);

module.exports = router;
