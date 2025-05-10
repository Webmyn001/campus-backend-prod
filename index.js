const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const authRoutes = require("./Routes/authRoutes");
const listingRoutes = require("./Routes/listingRoutes");
const proListingRoutes = require("./Routes/proListingRoutes");
const vipListingRoutes = require("./Routes/vipListingRoutes");
const profileRoutes = require("./Routes/profileRoutes");
const reviewRoutes = require("./Routes/reviewRoutes");
const contactRoutes = require("./Routes/contactRoutes");
const reportRoutes = require("./Routes/reportRoutes");


const cors =require("cors") 


dotenv.config();

const app = express();
// Enable CORS for all routes
app.use(cors());

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes); // Add goods listing routes
app.use("/api/pro-listings", proListingRoutes); // Add Pro Tier listing routes
app.use("/api/vip-listings", vipListingRoutes); // Add VIP listing routes
app.use("/api/profiles", profileRoutes); // Add Profile routes
app.use("/api/reviews", reviewRoutes); // Add Review routes
app.use("/api/contact", contactRoutes); // Add contact routes
app.use("/api/report", reportRoutes); // Add report routes



app.use(cors(
   {
      origin:["http://localhost:3000/"],
      methods: ["GET", "POST","PUT","DELETE"],
      credentials: true
   }
));


// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(5000, () => {
      console.log("Server running on port 5000");
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });