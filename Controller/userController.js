const mongoose = require("mongoose");
const User = require("../Models/User");
const Listing = require("../Models/Listing1");
const VipListing = require("../Models/vipListing");
const Product = require("../Models/Product");
const Subscription = require("../Models/Subscription");
const Setting = require("../Models/Setting");
const cloudinary = require("../config/cloudinary");
const { escapeRegex, isObjectId, sanitizeText } = require("../utils/security");
const { normalizeImagePayload } = require("../utils/images");

require("dotenv").config();

const PUBLIC_USER_FIELDS =
    "name username phone campusId profilePhoto course year hostel school_name location_city status whatsapp memberSince createdAt email isUserVerified role views";

const SELF_EDITABLE_FIELDS = [
    "name",
    "username",
    "phone",
    "campusId",
    "course",
    "year",
    "hostel",
    "school_name",
    "location_city",
    "status",
    "whatsapp",
    "profilePhoto",
];

const ADMIN_ONLY_FIELDS = ["isUserVerified", "role"];

function stringField(value, max = 120) {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/\u0000/g, "").trim();
    if (cleaned.length > max) return null;
    return cleaned;
}

function usernameField(value) {
    if (typeof value !== "string") return { error: "Username must be text." };
    const username = value.trim();
    if (username.length < 3 || username.length > 30) {
        return { error: "Username must be between 3 and 30 characters." };
    }
    if (!/^[A-Za-z0-9._-]+$/.test(username)) {
        return { error: "Username may only contain letters, numbers, dots, dashes and underscores." };
    }
    return { value: username };
}

// TEMPORARY promotion: keep every personal store link active regardless of
// subscription, so browsing/selling is friction-free for launch week.
// Restore the old behaviour by setting ALLOW_ALL_STORES=false in .env and
// removing the bypass below.
const ALLOW_ALL_STORES = process.env.ALLOW_ALL_STORES !== "false";

// Get all Users (admin only - enforced by the route)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select("-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires")
            .sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (error) {
        console.error("GetAllUsers Error:", error.message);
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
            name: { $exists: true, $ne: "" }
        }).select("name username profilePhoto school_name course location_city views isUserVerified");

        let officialViews = 0;
        try {
            const setting = await Setting.findOne({ key: "official_store_views" });
            if (setting) officialViews = setting.value || 0;
        } catch (e) {}

        const allUsers = [...users, {
            _id: "official_campuscrave_id",
            name: "CampusCrave Official",
            username: "campuscrave",
            school_name: "Obafemi Awolowo University",
            location_city: "Awo Hall, OAU",
            isUserVerified: true,
            views: officialViews,
            profilePhoto: { url: "https://campuscrave.com.ng/campus-crave-logo.png" }
        }];

        allUsers.sort((a, b) => (b.views || 0) - (a.views || 0));

        console.log(`[StoreDirectory] Found ${allUsers.length} active sellers.`);
        res.status(200).json(allUsers);
    } catch (error) {
        console.error("GetAllPublicStores Error:", error);
        res.status(500).json({ message: "Failed to fetch stores" });
    }
};

// Get User By ID (self or admin only)
exports.getUserById = async (req, res) => {
    const { id } = req.params;

    if (!isObjectId(id)) {
        return res.status(400).json({ message: "Invalid user id." });
    }
    if (String(req.user.id) !== String(id) && req.user.role !== "admin") {
        return res.status(403).json({ message: "You can only view your own account." });
    }

    try {
        const user = await User.findById(id).select(PUBLIC_USER_FIELDS);
        if (!user) return res.status(404).json({ message: "User not found." });

        res.status(200).json(user);
    } catch (error) {
        console.error("GetUserById Error:", error.message);
        res.status(500).json({ message: "Failed to fetch user" });
    }
};

// Update User (self or admin only; sensitive fields are admin-only)
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};

    if (!isObjectId(id)) {
        return res.status(400).json({ message: "Invalid user id." });
    }

    const isSelf = String(req.user.id) === String(id);
    const isAdmin = req.user.role === "admin";
    if (!isSelf && !isAdmin) {
        return res.status(403).json({ message: "You can only update your own account." });
    }

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const updates = {};
        for (const field of SELF_EDITABLE_FIELDS) {
            if (body[field] === undefined) continue;

            if (field === "username") {
                const result = usernameField(body.username);
                if (result.error) return res.status(400).json({ message: result.error });
                updates.username = result.value;
                continue;
            }

            if (field === "profilePhoto") {
                const photoInput =
                    typeof body.profilePhoto === "string"
                        ? body.profilePhoto
                        : body.profilePhoto?.url;

                if (!photoInput) {
                    return res.status(400).json({ message: "Invalid profilePhoto format." });
                }

                let uploadSource;
                try {
                    uploadSource = normalizeImagePayload(photoInput);
                } catch (err) {
                    return res.status(400).json({ message: err.message });
                }

                const uploaded = await cloudinary.uploader.upload(uploadSource, {
                    folder: "users",
                });
                updates.profilePhoto = {
                    url: uploaded.secure_url,
                    public_id: uploaded.public_id,
                };
                continue;
            }

            const value = stringField(body[field]);
            if (value === null) {
                return res.status(400).json({ message: `Invalid value for ${field}.` });
            }
            updates[field] = value;
        }

        if (isAdmin) {
            if (body.role !== undefined) {
                if (typeof body.role !== "string" || !["user", "admin"].includes(body.role)) {
                    return res.status(400).json({ message: "Invalid role." });
                }
                if (isSelf) {
                    return res.status(403).json({ message: "You cannot change your own role." });
                }
                updates.role = body.role;
            }

            if (body.isUserVerified !== undefined) {
                if (typeof body.isUserVerified !== "boolean") {
                    return res.status(400).json({ message: "isUserVerified must be a boolean." });
                }
                updates.isUserVerified = body.isUserVerified;
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No permitted fields were supplied." });
        }

        const previousPhotoPublicId =
            updates.profilePhoto && user.profilePhoto?.public_id
                ? user.profilePhoto.public_id
                : null;

        Object.assign(user, updates);
        await user.save();

        if (previousPhotoPublicId) {
            cloudinary.uploader.destroy(previousPhotoPublicId).catch((err) => {
                console.warn("Cloudinary destroy warning:", err.message);
            });
        }

        if (updates.isUserVerified !== undefined) {
            try {
                await Listing.updateMany(
                    { $or: [{ "sellerInfo.id": id }, { "sellerInfo._id": id }] },
                    { $set: { isUserVerified: updates.isUserVerified } }
                );
                await VipListing.updateMany(
                    { $or: [{ "sellerInfo.id": id }, { "sellerInfo._id": id }] },
                    { $set: { isUserVerified: updates.isUserVerified } }
                );
                await Product.updateMany(
                    { $or: [{ sellerId: id }, { "sellerInfo.id": id }] },
                    { $set: { isUserVerified: updates.isUserVerified } }
                );
            } catch (syncError) {
                console.error("Verification Sync Error:", syncError.message);
            }
        }

        const safeUser = await User.findById(id).select(
            "-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires"
        );
        res.status(200).json({ message: "User updated successfully", user: safeUser });
    } catch (error) {
        console.error("UpdateUser Error:", error.message);
        if (error.code === 11000) {
            return res.status(400).json({ message: "Username is already taken. Please choose another one." });
        }
        if (error.name === "ValidationError") {
            const first = Object.values(error.errors)[0];
            return res.status(400).json({ message: first?.message || "Invalid user data." });
        }
        res.status(500).json({ message: "Failed to update user" });
    }
};

// Delete User (self or admin only)
exports.deleteUser = async (req, res) => {
    const { id } = req.params;

    if (!isObjectId(id)) {
        return res.status(400).json({ message: "Invalid user id." });
    }

    const isSelf = String(req.user.id) === String(id);
    const isAdmin = req.user.role === "admin";
    if (!isSelf && !isAdmin) {
        return res.status(403).json({ message: "You can only delete your own account." });
    }

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (user.role === "admin") {
            const adminCount = await User.countDocuments({ role: "admin" });
            if (adminCount <= 1) {
                return res.status(400).json({ message: "The last admin account cannot be deleted." });
            }
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
            console.error("Listing Cleanup Error:", cleanupErr.message);
        }

        await User.findByIdAndDelete(id);
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("DeleteUser Error:", error.message);
        res.status(500).json({ message: "Failed to delete user" });
    }
};

// Get User Store (Aggregated profile, products, and services)
exports.getUserStore = async (req, res) => {
    const { identifier } = req.params;

    if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > 100) {
        return res.status(400).json({ message: "Invalid store identifier." });
    }

    try {
        const safeIdentifier = escapeRegex(identifier);
        // 1. Find user by either _id or username
        let user;
        console.log(`[StoreAccess] Fetching store for identifier: ${identifier}`);
        
        try {
            if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
                user = await User.findById(identifier).select("-password -email -phone -whatsapp");
            }
            if (!user) {
                user = await User.findOne({
                    username: { $regex: new RegExp(`^${safeIdentifier}$`, 'i') }
                }).select("-password -email -phone -whatsapp");
            }
            if (!user && identifier.length === 10) {
                user = await User.findOne({
                    $expr: {
                        $regexMatch: {
                            input: { $toString: "$_id" },
                            regex: safeIdentifier + "$",
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
            if (identifier.toLowerCase() === 'campuscrave') {
                // Read current official store views before building ghost object
                let currentOfficialViews = 0;
                try {
                    const currentSetting = await Setting.findOne({ key: "official_store_views" });
                    if (currentSetting) currentOfficialViews = currentSetting.value || 0;
                } catch (e) {}

                // Return Official Ghost Identity if user doesn't exist in DB
                user = {
                    _id: "official_campuscrave_id",
                    name: "CampusCrave Official",
                    username: "campuscrave",
                    school_name: "Obafemi Awolowo University",
                    location_city: "Awo Hall, OAU",
                    isUserVerified: true,
                    role: "admin",
                    views: currentOfficialViews,
                    bio: "The official home for safe campus shopping. We help student business owners get more customers with permanent store links and verified badges to grow your business.",
                    profilePhoto: { url: "/campus-crave-logo.png" }
                };
            } else {
                console.log(`[StoreAccess] No user found for: ${identifier}`);
                return res.status(404).json({ message: "Store not found." });
            }
        }

        // Increment Store View Count
        try {
            if (user._id === "official_campuscrave_id") {
                const setting = await Setting.findOneAndUpdate(
                    { key: "official_store_views" },
                    { $inc: { value: 1 } },
                    { upsert: true, new: true }
                );
                user.views = setting.value;
            } else {
                await User.findByIdAndUpdate(user._id, { $inc: { views: 1 } });
                user.views = (user.views || 0) + 1; // Update local user object for current response
            }
        } catch (incErr) {
            console.warn("Failed to increment store views:", incErr.message);
        }

        const userId = user._id.toString();

        const isOfficialStore = identifier.toLowerCase() === 'campuscrave' || user.username?.toLowerCase() === 'campuscrave';
        
        // 2. CHECK SUBSCRIPTION OR PROMO STATUS
        let activeSub = null;
        let promoSetting = null;

        if (!isOfficialStore) {
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
        } else {
            // Bypass for official store
            promoSetting = await Setting.findOne({ key: "isPromoActive" });
        }

        const isPromoActive = promoSetting ? promoSetting.value === true : false;
        
        console.log(`[StoreAccess] Result: User: ${userId}, hasSub: ${!!activeSub}, isPromo: ${isPromoActive}, isOfficial: ${isOfficialStore}`);

        // If neither is true, restrict access (unless it's the official store).
        // TEMPORARY: while ALLOW_ALL_STORES is on, every store stays active.
        if (!ALLOW_ALL_STORES && !activeSub && !isPromoActive && !isOfficialStore) {
            console.log(`[StoreAccess] DENIED for ${user.username} (${userId})`);
            return res.status(403).json({ 
                message: "This store's personal link is currently inactive.", 
                code: "STORE_INACTIVE",
                isOwner: String(req.query.viewerId) === String(userId),
                userName: user.name,
                username: user.username,
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
