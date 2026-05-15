const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Job title is required"],
        trim: true,
    },
    company: {
        type: String,
        required: [true, "Company name is required"],
        trim: true,
    },
    location: {
        type: String,
        required: [true, "Location is required"],
        default: "Remote",
    },
    type: {
        type: String,
        enum: ["Remote", "Onsite", "Hybrid", "Freelance", "Internship"],
        default: "Remote",
    },
    category: {
        type: String,
        required: [true, "Category is required"],
    },
    description: {
        type: String,
        required: [true, "Job description is required"],
    },
    applyUrl: {
        type: String,
        required: [true, "Application URL is required"],
    },
    salary: {
        type: String,
        default: "Negotiable",
    },
    source: {
        type: String,
        default: "CampusCrave",
    },
    externalId: {
        type: String,
        unique: true,
        sparse: true, // Only for jobs from external APIs
    },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
    },
    postedAt: {
        type: Date,
        default: Date.now,
    },
    isFeatured: {
        type: Boolean,
        default: false,
    },
    views: {
        type: Number,
        default: 0,
    }
});

module.exports = mongoose.models.Job || mongoose.model("Job", jobSchema);
