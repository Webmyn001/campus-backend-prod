const mongoose = require("mongoose");

// Utility function to format date and time (YYYY-MM-DD HH:mm)
function formatDateTime(date) {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return new Intl.DateTimeFormat("en-GB", options).format(date).replace(",", "");
}

const listingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
  },
  price: {
    type: String,
    required: [true, "Price is required"],
  },
  condition: {
    type: String,
    required: [true, "Condition is required"],
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    minlength: [10, "Description must be at least 10 characters long"],
  },
  images: {
    type: [String], // Array of image URLs
  },
  contactMethod: {
    type: String, // Contact method
    required: [true, "Contact method is required"],
  },
  postedAt: {
    type: Date,
    default: Date.now, // Automatically set the postedAt field
    immutable: true, // Prevent this field from being updated after creation
  },
  sellerInfo: {
    type: Object, // Seller information
    required: [true, "Seller info is required"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: "10s" }, // Automatically delete 24 hours after creation
  },
});

// Virtual field for formatted "postedAt" (e.g., "YYYY-MM-DD HH:mm")
listingSchema.virtual("formattedPostedAt").get(function () {
  return formatDateTime(this.postedAt);
});

// Virtual field to calculate hours left until deletion
listingSchema.virtual("hourLeft").get(function () {
  const now = new Date();
  const expiryTime = new Date(this.createdAt.getTime() + 24 * 60 * 60 * 1000); // Add 24 hours to createdAt
  const timeDiff = expiryTime - now; // Difference in milliseconds
  const hoursLeft = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60))); // Convert to hours, no negative values
  return hoursLeft;
});

// Ensure virtual fields are included in the output (e.g., when converting to JSON)
listingSchema.set("toJSON", { virtuals: true });
listingSchema.set("toObject", { virtuals: true });

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;