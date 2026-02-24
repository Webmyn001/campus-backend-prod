const User = require("../Models/User");
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

        // 2. Iterate and Send Sequentially
        let sentCount = 0;
        let failedCount = 0;

        for (const email of emails) {
            const name = userMap[email] || "CampusCraver";

            // Personalize body
            const personalizedBody = body.replace(/{{name}}/g, name).replace(/\n/g, "<br>");

            try {
                await sendEmail(email, subject, personalizedBody);
                sentCount++;

                // Add a small delay between emails to avoid triggering rate limits
                if (emails.indexOf(email) < emails.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to send to ${email}:`, error.message);
                failedCount++;
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
