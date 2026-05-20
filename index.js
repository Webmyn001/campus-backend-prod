require("dotenv").config(); // ✅ Always top to provide config to all imports
const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./Routes/authRoutes");
const listingRoutes = require("./Routes/listingRoutes");
const proListingRoutes = require("./Routes/proListingRoutes");
const vipListingRoutes = require("./Routes/vipListingRoutes");
const profileRoutes = require("./Routes/profileRoutes");
const reviewRoutes = require("./Routes/reviewRoutes");
const contactRoutes = require("./Routes/contactRoutes");
const reportRoutes = require("./Routes/reportRoutes");
const paymentRoutes = require("./Routes/paymentRoutes");
const userRoutes = require("./Routes/userRoutes");

const adminRoutes = require("./Routes/adminRoutes");
const productRoutes = require("./Routes/productRoutes");
const storePreviewRoutes = require("./Routes/storePreviewRoutes");

const analyticsRoutes = require("./Routes/analyticsRoutes");
const cronRoutes = require("./Routes/cronRoutes");
const jobRoutes = require("./Routes/jobRoutes");
const healthRoutes = require("./Routes/healthRoutes");

require("./jobs/cleanupExpiredListings");
const { runWeeklyAnalyticsJob } = require("./jobs/weeklyAnalyticsEmail");
const cors = require("cors")

const app = express();

// Increase body size limit to handle base64 images (e.g. up to 4.5mb to match Vercel)
app.use(express.json({ limit: "4.5mb" }));
app.use(express.urlencoded({ limit: "4.5mb", extended: true }));

// Enable CORS
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:8080",
  "https://campuscrave-lu04.onrender.com",
  "https://www.campuscrave.ng",
  "https://campuscrave.ng",
  "https://campus-plum.vercel.app"
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 204 // standard for OPTIONS success
}));


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes); // Add goods listing routes
app.use("/api/pro-listings", proListingRoutes); // Add Pro Tier listing routes
app.use("/api/vip-listings", vipListingRoutes); // Add VIP listing routes
app.use("/api/profiles", profileRoutes); // Add Profile routes
app.use("/api/reviews", reviewRoutes); // Add Review routes
app.use("/api/contact", contactRoutes); // Add contact routes
app.use("/api/report", reportRoutes); // Add report routes
app.use("/api/users", userRoutes); // Add user routes
app.use("/api/admin", adminRoutes); // Add admin routes
app.use("/api/products", productRoutes); // Add admin-managed product routes
app.use("/api/public", storePreviewRoutes); // Add public preview routes
app.use("/api", paymentRoutes);
app.use("/api/analytics", analyticsRoutes); // Add analytics routes
app.use("/api/cron", cronRoutes); // Add cron routes for Vercel
app.use("/api/jobs", jobRoutes); // Add Jobs & Opportunities routes
app.use("/api", healthRoutes); // Add health/ping routes

// ✅ Global Error Handler to catch 500s and log them
app.use((err, req, res, next) => {
  console.error("❌ INTERNAL SERVER ERROR:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message // Temporarily exposing to help fix widespread failure
  });
});

// Connect to MongoDB and start server
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not defined in environment variables!");
}

mongoose
  .connect(process.env.MONGO_URI || "", { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ Connected to MongoDB");
    // Run any due jobs (e.g. Weekly Analytics if it's Sunday and hasn't run yet)
    runWeeklyAnalyticsJob().catch(err => console.error("❌ Startup Job Error:", err));

    // Ensure we are listening only in local dev; Vercel uses the exported 'app'
    if (process.env.NODE_ENV !== "production") {
      app.listen(5000, () => {
        console.log("🚀 Server running on port 5000");
      });
    }
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
  });

module.exports = app;