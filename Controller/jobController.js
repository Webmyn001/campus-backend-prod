const Job = require("../Models/Job");
const axios = require("axios");

// Fetch jobs from Adzuna API (Automated Fetcher)
exports.fetchJobsFromAPI = async (req, res) => {
    try {
        const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID; 
        const ADZUNA_API_KEY = process.env.ADZUNA_API_KEY; 

        if (!ADZUNA_APP_ID || !ADZUNA_API_KEY) {
            console.warn("⚠️ Adzuna credentials missing. Skipping fetch.");
            if (res) return res.status(400).json({ success: false, message: "Adzuna credentials missing." });
            return;
        }

        const searchTerms = [
            "software", "internship", "design", "developer", "graduate", 
            "frontend", "backend", "ui/ux", "graphics", "cybersecurity",
            "data analysis", "fashion", "social media", "content creator", "tutoring"
        ];
        let totalCreated = 0;

        for (const term of searchTerms) {
            const url = `https://api.adzuna.com/v1/api/jobs/ng/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_API_KEY}&results_per_page=15&what=${encodeURIComponent(term)}`;
            
            try {
                console.log(`🔍 Syncing ${term} from Adzuna...`);
                const response = await axios.get(url);
                const adzunaJobs = response.data.results || [];
                console.log(`📦 Found ${adzunaJobs.length} results for ${term}`);

                for (const adjob of adzunaJobs) {
                    const existing = await Job.findOne({ externalId: adjob.id });
                    if (existing) continue;

                    // Determine Job Type
                    let jobType = "Remote";
                    const contract = adjob.contract_time || "";
                    if (contract.includes("full_time")) jobType = "Onsite";
                    if (term.toLowerCase().includes("intern")) jobType = "Internship";
                    if (term.toLowerCase().includes("freelance")) jobType = "Freelance";

                    await Job.create({
                        title: adjob.title.replace(/<\/?[^>]+(>|$)/g, "").trim(),
                        company: adjob.company?.display_name || "Verified Partner",
                        location: adjob.location?.display_name || "Nigeria",
                        type: jobType,
                        category: term.toUpperCase(),
                        description: adjob.description.replace(/<\/?[^>]+(>|$)/g, "").trim(),
                        applyUrl: adjob.redirect_url,
                        salary: adjob.salary_min ? `₦${adjob.salary_min.toLocaleString()}` : "Negotiable",
                        source: "Adzuna",
                        externalId: adjob.id,
                        status: "pending",
                        postedAt: adjob.created ? new Date(adjob.created) : new Date()
                    });
                    totalCreated++;
                }
            } catch (error) {
                console.error(`❌ Error syncing ${term}:`, error.response?.data || error.message);
            }
        }

        if (res) res.status(200).json({ success: true, message: `Skill Market sync completed. Found ${totalCreated} new opportunities.` });
        console.log(`✅ Skill Market sync completed. Added ${totalCreated} new entries.`);
    } catch (err) {
        console.error("❌ Job Controller Error (fetch):", err.message);
        if (res) res.status(500).json({ success: false, error: err.message });
    }
};

// Get all approved jobs (Public)
exports.getApprovedJobs = async (req, res) => {
    try {
        const jobs = await Job.find({ status: "approved" }).sort({ postedAt: -1 });
        res.status(200).json(jobs);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get all pending jobs (Admin)
exports.getPendingJobs = async (req, res) => {
    try {
        const jobs = await Job.find({ status: "pending" }).sort({ postedAt: -1 });
        res.status(200).json(jobs);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin Action: Approve/Reject/Delete
exports.updateJobStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'approved', 'rejected'

        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status." });
        }

        const job = await Job.findByIdAndUpdate(id, { status }, { new: true });
        if (!job) return res.status(404).json({ message: "Job not found." });

        res.status(200).json({ success: true, message: `Job ${status} successfully.`, job });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin Action: Edit Job
exports.editJob = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const job = await Job.findByIdAndUpdate(id, updates, { new: true });
        if (!job) return res.status(404).json({ message: "Job not found." });

        res.status(200).json({ success: true, message: "Job updated successfully.", job });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin Action: Delete Job
exports.deleteJob = async (req, res) => {
    try {
        const { id } = req.params;
        await Job.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Job deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin Action: Manual Post
exports.createManualJob = async (req, res) => {
    try {
        const jobData = req.body;
        // Manual jobs are approved by default
        const job = await Job.create({ ...jobData, status: "approved" });
        res.status(201).json({ success: true, job });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Track views
exports.trackJobView = async (req, res) => {
    try {
        const { id } = req.params;
        await Job.findByIdAndUpdate(id, { $inc: { views: 1 } });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
