const User = require("../Models/User");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const Product = require("../Models/Product");
const cloudinary = require("../config/cloudinary");

// Get all Users
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json(users);
    } catch (error) {
        console.error("GetAllUsers Error:", error);
        res.status(500).json({ message: "Failed to fetch users" });
    }
};

// Get User By ID
exports.getUserById = async (req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: "User not found." });

        res.status(200).json(user);
    } catch (error) {
        console.error("GetUserById Error:", error);
        res.status(500).json({ message: "Failed to fetch user" });
    }
};

// Update User
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const updates = { ...req.body };

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // If updating profilePhoto
        if (updates.profilePhoto) {
            let photoToUpload;

            // Determine string to upload
            if (typeof updates.profilePhoto === "object" && updates.profilePhoto.url) {
                photoToUpload = updates.profilePhoto.url;
            } else if (typeof updates.profilePhoto === "string") {
                photoToUpload = updates.profilePhoto;
            } else {
                return res.status(400).json({ message: "Invalid profilePhoto format." });
            }

            // Delete old photo safely
            if (user.profilePhoto?.public_id) {
                try {
                    await cloudinary.uploader.destroy(user.profilePhoto.public_id);
                } catch (err) {
                    console.warn("Cloudinary destroy warning:", err.message);
                }
            }

            // Upload new photo
            const uploaded = await cloudinary.uploader.upload(photoToUpload, {
                folder: "users",
            });

            updates.profilePhoto = {
                url: uploaded.secure_url,
                public_id: uploaded.public_id,
            };
        }

        // Update user with new fields
        const updatedUser = await User.findByIdAndUpdate(id, updates, {
            new: true,
            runValidators: true,
        });

        res.status(200).json({ message: "User updated successfully", user: updatedUser });
    } catch (error) {
        console.error("UpdateUser Error:", error);
        res.status(500).json({ message: "Failed to update user" });
    }
};

// Delete User
exports.deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Delete profile photo from cloudinary if exists
        if (user.profilePhoto?.public_id) {
            try {
                await cloudinary.uploader.destroy(user.profilePhoto.public_id);
            } catch (err) {
                console.warn("Cloudinary destroy warning during deletion:", err.message);
            }
        }

        await User.findByIdAndDelete(id);
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("DeleteUser Error:", error);
        res.status(500).json({ message: "Failed to delete user" });
    }
};

// Get User Store (Aggregated profile, products, and services)
exports.getUserStore = async (req, res) => {
    const { identifier } = req.params;

    try {
        // 1. Find user by either _id or username
        let user;
        if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
            // It's a valid ObjectId
            user = await User.findById(identifier).select("-password -email -phone -whatsapp");
        }

        if (!user) {
            // Try searching by username (case-insensitive)
            user = await User.findOne({
                username: { $regex: new RegExp(`^${identifier}$`, 'i') }
            }).select("-password -email -phone -whatsapp");
        }

        if (!user) {
            return res.status(404).json({ message: "Store not found." });
        }

        const userId = user._id.toString();

        // 2. Fetch Community Listings (Products)
        // SellerInfo stores ID differently across schemas, checking common patterns
        const communityListings = await Listing.find({
            $or: [
                { "sellerInfo.id": userId },
                { "sellerInfo._id": userId },
                { "sellerInfo": userId } // Just in case it's a string ref
            ]
        }).sort({ postedAt: -1 });

        // 3. Fetch VIP Listings (Business Services)
        const businessListings = await VipListing.find({
            $or: [
                { "sellerInfo.id": userId },
                { "sellerInfo._id": userId },
                { "sellerInfo": userId }
            ]
        }).sort({ postedAt: -1 });

        // 4. Return aggregated data
        res.status(200).json({
            user,
            products: communityListings,
            businessServices: businessListings
        });

    } catch (error) {
        console.error("GetUserStore Error:", error);
        res.status(500).json({ message: "Failed to load user store" });
    }
};
