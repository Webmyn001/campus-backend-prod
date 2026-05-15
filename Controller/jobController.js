const Job = require("../Models/Job");
const axios = require("axios");

// --- Helper: Fetch from Remotive (Excellent for Tech/Design/Marketing Gigs) ---
const syncRemotive = async () => {
    try {
        console.log("🔍 Syncing from Remotive API...");
        const response = await axios.get("https://remotive.com/api/remote-jobs?limit=20");
        const jobs = response.data.jobs || [];
        let created = 0;

        for (const rjob of jobs) {
            const existing = await Job.findOne({ externalId: rjob.id.toString() });
            if (existing) continue;

            await Job.create({
                title: rjob.title,
                company: rjob.company_name,
                location: rjob.candidate_required_location || "Remote",
                type: "Remote",
                category: (rjob.category || "Software").toUpperCase(),
                description: rjob.description.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 500) + "...",
                applyUrl: rjob.url,
                salary: rjob.salary || "Negotiable",
                source: "Remotive",
                externalId: rjob.id.toString(),
                status: "pending",
                postedAt: new Date(rjob.publication_date)
            });
            created++;
        }
        console.log(`✅ Remotive Sync: Added ${created} entries.`);
        return created;
    } catch (err) {
        console.error("❌ Remotive Sync Error:", err.message);
        return 0;
    }
};

// --- Helper: Fetch from Adzuna (Nigeria Local) ---
const syncAdzuna = async () => {
    const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
    const ADZUNA_API_KEY = process.env.ADZUNA_API_KEY;
    if (!ADZUNA_APP_ID) return 0;

    const terms = ["internship", "graduate", "developer", "design", "marketing"];
    let created = 0;

    for (const term of terms) {
        try {
            const url = `https://api.adzuna.com/v1/api/jobs/ng/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_API_KEY}&results_per_page=10&what=${encodeURIComponent(term)}`;
            const res = await axios.get(url);
            const adJobs = res.data.results || [];

            for (const adjob of adJobs) {
                const existing = await Job.findOne({ externalId: adjob.id });
                if (existing) continue;

                await Job.create({
                    title: adjob.title.replace(/<\/?[^>]+(>|$)/g, "").trim(),
                    company: adjob.company?.display_name || "Verified Partner",
                    location: adjob.location?.display_name || "Nigeria",
                    type: term.includes("intern") ? "Internship" : "Onsite",
                    category: term.toUpperCase(),
                    description: adjob.description.replace(/<\/?[^>]+(>|$)/g, "").trim(),
                    applyUrl: adjob.redirect_url,
                    salary: adjob.salary_min ? `₦${adjob.salary_min.toLocaleString()}` : "Negotiable",
                    source: "Adzuna",
                    externalId: adjob.id,
                    status: "pending",
                    postedAt: new Date(adjob.created)
                });
                created++;
            }
        } catch (e) { console.error(`Adzuna ${term} error:`, e.message); }
    }
    console.log(`✅ Adzuna Sync: Added ${created} entries.`);
    return created;
};

// --- Helper: Fetch from The Muse (International Roles) ---
const syncTheMuse = async () => {
    try {
        console.log("🔍 Syncing from The Muse API...");
        const response = await axios.get("https://www.themuse.com/api/public/jobs?page=1&location=Nigeria&location=Remote");
        const jobs = response.data.results || [];
        let created = 0;

        for (const mjob of jobs) {
            const existing = await Job.findOne({ externalId: mjob.id.toString() });
            if (existing) continue;

            await Job.create({
                title: mjob.name,
                company: mjob.company?.name || "The Muse",
                location: mjob.locations?.[0]?.name || "Remote",
                type: "Remote",
                category: (mjob.categories?.[0]?.name || "General").toUpperCase(),
                description: mjob.contents.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 500) + "...",
                applyUrl: mjob.refs?.landing_page,
                salary: "Negotiable",
                source: "The Muse",
                externalId: mjob.id.toString(),
                status: "pending",
                postedAt: new Date(mjob.publication_date)
            });
            created++;
        }
        console.log(`✅ The Muse Sync: Added ${created} entries.`);
        return created;
    } catch (err) {
        console.error("❌ The Muse Sync Error:", err.message);
        return 0;
    }
};

// Main Fetch Controller
exports.fetchJobsFromAPI = async (req, res) => {
    try {
        const adzunaCount = await syncAdzuna();
        const remotiveCount = await syncRemotive();
        const museCount = await syncTheMuse();

        const total = adzunaCount + remotiveCount + museCount;

        if (res) res.status(200).json({ 
            success: true, 
            message: `Sync completed. Added ${total} new entries.`,
            breakdown: { adzuna: adzunaCount, remotive: remotiveCount, themuse: museCount }
        });
    } catch (err) {
        console.error("❌ Job Sync Error:", err.message);
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
