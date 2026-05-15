const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Product name is required"],
        trim: true,
    },
    price: {
        type: Number,
        required: [true, "Price is required"],
    },
    description: {
        type: String,
        required: [true, "Short description is required"],
    },
    fullDescription: {
        type: String,
        required: [true, "Full description is required"],
    },
    // Main representative image
    mainImage: {
        url: { type: String },
        public_id: { type: String },
    },
    // Optional image gallery
    images: [
        {
            url: { type: String, required: true },
            public_id: { type: String, required: true },
        },
    ],
    category: {
        type: String,
        required: true,
    },
    availability: {
        type: String,
        enum: ["In Stock", "Low Stock", "Out of Stock"],
        default: "In Stock",
    },
    type: {
        type: String,
        enum: ["admin-gadget", "admin-food", "community"],
        required: true,
    },
    soldOut: {
        type: Boolean,
        default: false,
    },
    school_name: { type: String, index: true },
    location_city: { type: String, index: true },
    isUserVerified: { type: Boolean, default: false },
    isManaged: { type: Boolean, default: false },
    ownerName: { type: String },

    // Seller Information (Can be prefilled for Admin)
    sellerName: { type: String },
    sellerWhatsApp: { type: String },
    sellerImage: { type: String },
    sellerCourse: { type: String },
    sellerLevel: { type: String },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    views: {
        type: Number,
        default: 0,
    },
    whatsappClicks: {
        type: Number,
        default: 0,
    },

    postedAt: {
        type: Date,
        default: Date.now,
        immutable: true,
    },
});

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
