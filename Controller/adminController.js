const User = require("../Models/User");
const Setting = require("../Models/Setting");
const sendEmail = require("../utils/sendEmail");

// Send bulk email to list of users or all users
exports.sendBulkEmail = async (req, res) => {
    const { subject, body, emails } = req.body;

    if (!subject || !body || !emails || !Array.isArray(emails)) {
        return res.status(400).json({ message: "Subject, body, and emails array are required." });
    }

    try {
        // 1. Fetch users to get names for personalization (optional optimization: only fetch name & email)
        const users = await User.find({ email: { $in: emails } }).select("email name");

        // Create a map for quick lookup: email -> name
        const userMap = {};
        users.forEach((u) => {
            userMap[u.email] = u.name || "User";
        });

        // 2. Iterate and Send in Batches
        let sentCount = 0;
        let failedCount = 0;
        const BATCH_SIZE = 10;
        const BATCH_DELAY = 3000; // 3 seconds between batches
        const EMAIL_DELAY = 1000; // 1 second between emails within a batch

        for (let i = 0; i < emails.length; i += BATCH_SIZE) {
            const batch = emails.slice(i, i + BATCH_SIZE);

            for (const email of batch) {
                const name = userMap[email] || "CampusCraver";
                const personalizedBody = body.replace(/{{name}}/g, name).replace(/\n/g, "<br>");

                try {
                    await sendEmail(email, subject, personalizedBody);
                    sentCount++;

                    // Delay between emails in the same batch
                    if (batch.indexOf(email) < batch.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, EMAIL_DELAY));
                    }
                } catch (error) {
                    console.error(`Failed to send to ${email}:`, error.message);
                    failedCount++;
                }
            }

            // Delay between batches
            if (i + BATCH_SIZE < emails.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        res.status(200).json({
            message: "Bulk email process completed",
            sent: sentCount,
            failed: failedCount,
        });
    } catch (error) {
        console.error("Bulk Email Error:", error);
        res.status(500).json({ message: "Failed to send bulk emails", error: error.message });
    }
};

// Update global promo status
exports.updatePromoStatus = async (req, res) => {
    const { isPromoActive } = req.body;

    if (typeof isPromoActive !== "boolean") {
        return res.status(400).json({ message: "isPromoActive boolean is required." });
    }

    try {
        const setting = await Setting.findOneAndUpdate(
            { key: "isPromoActive" },
            { value: isPromoActive, updatedAt: Date.now() },
            { upsert: true, new: true }
        );

        res.status(200).json({
            message: `Promo status updated to ${isPromoActive}`,
            isPromoActive: setting.value
        });
    } catch (error) {
        console.error("Update Promo Status Error:", error);
        res.status(500).json({ message: "Failed to update promo status", error: error.message });
    }
};
