const mongoose = require("mongoose");
const User = require("../Models/User");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const Product = require("../Models/Product");
const Subscription = require("../Models/Subscription");
const Setting = require("../Models/Setting");
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

// Get All Public Stores
exports.getAllPublicStores = async (req, res) => {
    try {
        // 1. Get unique seller IDs from both regular and VIP listing collections
        // We check for both .id and ._id variations used in the sellerInfo object
        const [regSellersId, regSellersUnderscoreId, vipSellersId, vipSellersUnderscoreId] = await Promise.all([
            Listing.distinct("sellerInfo.id"),
            Listing.distinct("sellerInfo._id"),
            VipListing.distinct("sellerInfo.id"),
            VipListing.distinct("sellerInfo._id")
        ]);

        // Combine and filter to get a unique set of IDs
        const allSellerIds = [...new Set([
            ...regSellersId,
            ...regSellersUnderscoreId,
            ...vipSellersId,
            ...vipSellersUnderscoreId
        ])].filter(id => id && mongoose.Types.ObjectId.isValid(id.toString()));

        // 2. Find users who have listings AND have complete profiles
        // Complete profile = name, username, school_name, and course are all present
        const users = await User.find({
            _id: { $in: allSellerIds },
            username: { $exists: true, $ne: "" },
            name: { $exists: true, $ne: "" },
            school_name: { $exists: true, $ne: "" },
            course: { $exists: true, $ne: "" }
        }).select("name username profilePhoto school_name course location_city views");

        console.log(`[StoreDirectory] Found ${users.length} active sellers with complete profiles.`);
        res.status(200).json(users);
    } catch (error) {
        console.error("GetAllPublicStores Error:", error);
        res.status(500).json({ message: "Failed to fetch stores" });
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

        // Sync verification status if updated
        if (updates.isUserVerified !== undefined) {
            try {
                // Update Community Listings
                await Listing.updateMany(
                    { $or: [{ "sellerInfo.id": id }, { "sellerInfo._id": id }] },
                    { $set: { isUserVerified: updates.isUserVerified } }
                );

                // Update VIP Listings
                await VipListing.updateMany(
                    { $or: [{ "sellerInfo.id": id }, { "sellerInfo._id": id }] },
                    { $set: { isUserVerified: updates.isUserVerified } }
                );

                // Update Community Products (if any in Product model)
                await Product.updateMany(
                    { $or: [{ "sellerId": id }, { "sellerInfo.id": id }] },
                    { $set: { isUserVerified: updates.isUserVerified } }
                );
            } catch (syncError) {
                console.error("Verification Sync Error:", syncError);
                // We don't fail the whole request but log it
            }
        }

        res.status(200).json({ message: "User updated successfully", user: updatedUser });
    } catch (error) {
        console.error("UpdateUser Error:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "Username is already taken. Please choose another one." });
        }
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

        // Delete User Listings across all models
        try {
            // Delete Community Listings
            await Listing.deleteMany({ $or: [{ "sellerInfo.id": id }, { "sellerInfo._id": id }] });

            // Delete VIP Listings
            await VipListing.deleteMany({ $or: [{ "sellerInfo.id": id }, { "sellerInfo._id": id }] });

            // Delete Community Products
            await Product.deleteMany({ $or: [{ "sellerId": id }, { "sellerInfo.id": id }] });

            console.log(`Cleaned up listings for deleted user: ${id}`);
        } catch (cleanupErr) {
            console.error("Listing Cleanup Error:", cleanupErr);
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
        console.log(`[StoreAccess] Fetching store for identifier: ${identifier}`);
        
        try {
            if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
                user = await User.findById(identifier).select("-password -email -phone -whatsapp");
            }
            if (!user) {
                user = await User.findOne({
                    username: { $regex: new RegExp(`^${identifier}$`, 'i') }
                }).select("-password -email -phone -whatsapp");
            }
            if (!user && identifier.length === 10) {
                user = await User.findOne({
                    $expr: {
                        $regexMatch: {
                            input: { $toString: "$_id" },
                            regex: identifier + "$",
                            options: "i"
                        }
                    }
                }).select("-password -email -phone -whatsapp");
            }
        } catch (findUserErr) {
            console.error("❌ Find User Error:", findUserErr);
            throw new Error(`Failed to find user by identifier: ${findUserErr.message}`);
        }

        if (!user) {
            console.log(`[StoreAccess] No user found for: ${identifier}`);
            return res.status(404).json({ message: "Store not found." });
        }

        // Increment Store View Count
        try {
            await User.findByIdAndUpdate(user._id, { $inc: { views: 1 } });
            user.views = (user.views || 0) + 1; // Update local user object for current response
        } catch (incErr) {
            console.warn("Failed to increment store views:", incErr.message);
        }

        const userId = user._id.toString();

        // 2. CHECK SUBSCRIPTION OR PROMO STATUS
        let activeSub = null;
        let promoSetting = null;

        try {
            [activeSub, promoSetting] = await Promise.all([
                Subscription.findOne({
                    userId: new mongoose.Types.ObjectId(userId),
                    plan: "premium",
                    paymentStatus: "successful",
                    expiresAt: { $gte: new Date() }
                }),
                Setting.findOne({ key: "isPromoActive" })
            ]);
        } catch (subCheckErr) {
            console.error("❌ Subscription/Promo Check Error:", subCheckErr);
            throw new Error(`Failed to check subscription: ${subCheckErr.message}`);
        }

        const isPromoActive = promoSetting ? promoSetting.value === true : false;
        
        console.log(`[StoreAccess] Result: User: ${userId}, hasSub: ${!!activeSub}, isPromo: ${isPromoActive}`);

        // If neither is true, restrict access
        if (!activeSub && !isPromoActive) {
            console.log(`[StoreAccess] DENIED for ${user.username} (${userId})`);
            return res.status(403).json({ 
                message: "This store's personal link is currently inactive.", 
                code: "STORE_INACTIVE",
                isOwner: String(req.query.viewerId) === String(userId),
                debug: {
                    hasActiveSub: !!activeSub,
                    isPromoActive: isPromoActive,
                    userIdMatched: userId
                }
            });
        }

        // 3. Fetch Community Listings (Products)
        let communityListings = [];
        let businessListings = [];

        try {
            [communityListings, businessListings] = await Promise.all([
                Listing.find({
                    $or: [
                        { "sellerInfo.id": userId },
                        { "sellerInfo._id": userId },
                        { "sellerInfo": userId }
                    ]
                }).sort({ postedAt: -1 }),
                VipListing.find({
                    $or: [
                        { "sellerInfo.id": userId },
                        { "sellerInfo._id": userId },
                        { "sellerInfo": userId }
                    ]
                }).sort({ postedAt: -1 })
            ]);
        } catch (fetchListingsErr) {
            console.error("❌ Fetch Listings Error:", fetchListingsErr);
            throw new Error(`Failed to fetch listings: ${fetchListingsErr.message}`);
        }

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
