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
  category: {
    type: String,
    default: "Other Goods"
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
  type: {
    type: String, // Contact method
    default: "urgent"
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

  // ===== OAU Final-Year Quick Sale / marketplace campaign fields =====
  // (all optional -> existing community listings are unaffected)
  saleType: {
    type: String,
    enum: ["regular", "final_year"],
    default: "regular",
    index: true,
  },
  institution: { type: String, trim: true, index: true },
  institutionCode: { type: String, uppercase: true, trim: true, index: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution" },
  campaign: { type: String, trim: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", index: true },
  // Numeric selling price for marketplace items (existing `price` stays a String
  // for backward compatibility; all server-side money math uses priceAmount).
  priceAmount: { type: Number, min: 0, index: true },
  // Electrical category honesty (Electronics/Appliances require these)
  workingCondition: { type: String, trim: true },
  conditionNote: { type: String, trim: true },
  pickupLocation: { type: String, trim: true },
  deliveryAvailable: { type: Boolean, default: false },
  deliveryFee: { type: Number, default: 0, min: 0 },
  deliveryArrangement: { type: String, trim: true },
  listingState: {
    type: String,
    enum: ["active", "reserved", "sold", "archived", "suspended"],
    default: "active",
    index: true,
  },
  approvalNote: { type: String, trim: true },
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
  sellerInfo: {
    type: Object, // Seller information
    required: [true, "Seller info is required"],
  },
  views: {
    type: Number,
    default: 0,
  },
  whatsappClicks: {
    type: Number,
    default: 0,
  },


  //   expiresAt: {
  //   type: Date, 
  //   required: true, // keep the field
  // },
});

// Virtual field for formatted "postedAt" (e.g., "YYYY-MM-DD HH:mm")
listingSchema.virtual("formattedPostedAt").get(function () {
  return formatDateTime(this.postedAt);
});

// Virtual field to calculate seconds left until deletion
// listingSchema.virtual("secondsLeft").get(function () {
//   const now = new Date();
//   const expiryTime = this.expiresAt;
//   const timeDiff = expiryTime - now; // Difference in milliseconds
//   const secondsLeft = Math.max(0, Math.floor(timeDiff / 1000)); // Convert to seconds, no negative values
//   return secondsLeft;
// });

listingSchema.set("toJSON", { virtuals: true });
listingSchema.set("toObject", { virtuals: true });

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;