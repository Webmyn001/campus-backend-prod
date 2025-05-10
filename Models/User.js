const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");


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


const userSchema = new mongoose.Schema({

  
  name: {
    type: String,
  },

  phone: {
    type: String,
  },


  campusId: {
    type: String,
  },

  profilePhoto: {
    type: String,
  },

  course: {
    type: String,
  },

  year: {
    type: String,
  },

  hostel: {
    type: String,
  },

  status: {
    type: String,
  },

  emergencyContact: {
    type: String,
  },

  memberSince: {
    type: Date,
    default: Date.now, // Automatically set the postedAt field
    immutable: true, // Prevent this field from being updated after creation
  },
  
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the created date
  },

  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    match: [/.+\@.+\..+/, "Please enter a valid email"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [6, "Password must be at least 6 characters"],
  },
});



// Virtual field for formatted "postedAt" (e.g., "YYYY-MM-DD HH:mm")
userSchema.virtual("formattedMemberSince").get(function () {
  return formatDateTime(this.memberSince);
});

// Ensure virtual fields are included in the output (e.g., when converting to JSON)
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });


// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password for login
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;