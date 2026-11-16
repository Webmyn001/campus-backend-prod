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

const marketplaceRoutes = require("./Routes/marketplaceRoutes");
const marketplaceAdminRoutes = require("./Routes/marketplaceAdminRoutes");

const oktoberFestRoutes = require("./Routes/oktoberFestRoutes");
const oktoberFestAdminRoutes = require("./Routes/oktoberFestAdminRoutes");

const partnerRoutes = require("./Routes/partnerRoutes");
const partnerAdminRoutes = require("./Routes/partnerAdminRoutes");

require("./jobs/cleanupExpiredListings");
const { runWeeklyAnalyticsJob } = require("./jobs/weeklyAnalyticsEmail");
const cors = require("cors")

const app = express();
app.disable("x-powered-by");

// Basic security headers. CSP/HSTS are handled at the hosting/proxy layer.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
});

// Increase body size limit to handle base64 images (e.g. up to 12mb to fit a main + optional gallery images)
// The verify callback keeps the raw bytes so webhook signatures can be checked
// against exactly what the partner sent.
app.use(
  express.json({
    limit: "12mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ limit: "12mb", extended: true }));

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

if (process.env.CORS_ORIGINS) {
  for (const origin of process.env.CORS_ORIGINS.split(",")) {
    const trimmed = origin.trim().replace(/\/+$/, "");
    if (trimmed && !allowedOrigins.includes(trimmed)) allowedOrigins.push(trimmed);
  }
}

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

// OAU Final-Year Quick Sale marketplace
app.use("/api/marketplace", marketplaceRoutes); // public + buyer/seller flows
app.use("/api/admin", marketplaceAdminRoutes); // admin-only marketplace endpoints

// Campus Crave Oktober Fest (official store)
app.use("/api/oktober-fest", oktoberFestRoutes); // public + buyer flows
app.use("/api/admin", oktoberFestAdminRoutes); // admin-only Oktober Fest endpoints

// Partner Shopping (Jumia / Temu) — public catalogue, tracked clicks, webhooks
app.use("/api/partner", partnerRoutes);
app.use("/api/admin/partner", partnerAdminRoutes);

// ✅ 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error("❌ INTERNAL SERVER ERROR:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  if (res.headersSent) return next(err);

  const status = Number(err.status || err.statusCode);
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request body is too large." });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body." });
  }
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ success: false, message: "Request could not be processed." });
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error"
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
    runWeeklyAnalyticsJob().catch(err =>
      console.error("❌ Startup Job Error:", err)
    );

    // Listen locally on 5000, Render uses process.env.PORT
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
  });

  

module.exports = app;
