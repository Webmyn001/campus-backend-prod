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

const ViplistingSchema = new mongoose.Schema({


  category: {
    type: String,
    default: "Other Services"
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
  sellerInfo: {
    type: Object, // Seller information
    required: [true, "Seller info is required"],
  },

  postedAt: {
    type: Date,
    default: Date.now, // Automatically set the postedAt field
    immutable: true, // Prevent this field from being updated after creation
  },
  isManaged: {
    type: Boolean,
    default: false
  },
  ownerName: {
    type: String,
  },
  ownerLocation: {
    type: String,
  },
  type: {
    type: String, // Contact method
    default: "service"
  },

  soldOut: {
    type: Boolean,
    default: false
  },
  school_name: { type: String, index: true },
  location_city: { type: String, index: true },
  isUserVerified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true,
  },

  // expiresAt: {
  //   type: Date,
  //   required: true, // keep the field
  // },

  // ===== New fields added for premium business/service listings =====
  businessName: {
    type: String,
    required: [true, "Business/Service Name is required"],
  },
  address: {
    type: String,
    required: [true, "Address is required"],
  },
  fullDescription: {
    type: String,
    required: [true, "Full Description is required"],
    minlength: [20, "Full Description must be at least 20 characters long"],
  },
  workingHours: {
    type: String,
    required: [true, "Working Hours are required"],
  },
  businessEmail: {
    type: String,
    required: [true, "Business Email is required"],
    lowercase: true,
    trim: true,
  },
  views: {
    type: Number,
    default: 0,
  },
  whatsappClicks: {
    type: Number,
    default: 0,
  },
});

// Virtual field for formatted "postedAt" (e.g., "YYYY-MM-DD HH:mm")
ViplistingSchema.virtual("formattedPostedAt").get(function () {
  return formatDateTime(this.postedAt);
});

// Virtual field to calculate seconds left until deletion
ViplistingSchema.virtual("secondsLeft").get(function () {
  const now = new Date();
  const expiryTime = this.expiresAt;
  const timeDiff = expiryTime - now; // Difference in milliseconds
  const secondsLeft = Math.max(0, Math.floor(timeDiff / 1000)); // Convert to seconds, no negative values
  return secondsLeft;
});

ViplistingSchema.set("toJSON", { virtuals: true });
ViplistingSchema.set("toObject", { virtuals: true });

const VipListing = mongoose.model("VipListing", ViplistingSchema);

module.exports = VipListing;
