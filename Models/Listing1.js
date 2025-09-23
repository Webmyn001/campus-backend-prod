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
  images: [
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
  },
],
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


  expiresAt: {
  type: Date,
  required: true, // keep the field
},
});

// Virtual field for formatted "postedAt" (e.g., "YYYY-MM-DD HH:mm")
listingSchema.virtual("formattedPostedAt").get(function () {
  return formatDateTime(this.postedAt);
});

// Virtual field to calculate seconds left until deletion
listingSchema.virtual("secondsLeft").get(function () {
  const now = new Date();
  const expiryTime = this.expiresAt;
  const timeDiff = expiryTime - now; // Difference in milliseconds
  const secondsLeft = Math.max(0, Math.floor(timeDiff / 1000)); // Convert to seconds, no negative values
  return secondsLeft;
});

listingSchema.set("toJSON", { virtuals: true });
listingSchema.set("toObject", { virtuals: true });

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;