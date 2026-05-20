const axios = require("axios");
require("dotenv").config();

function parseSender(senderString) {
  if (!senderString) return null;
  const match = senderString.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim() || undefined, email: match[2].trim() };
  }
  return { email: senderString.trim() };
}

async function sendTestEmail() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderInfo = parseSender(process.env.SMTP_FROM || process.env.BREVO_FROM);
  if (!apiKey) {
    console.error("❌ BREVO_API_KEY is not configured.");
    process.exit(1);
  }
  if (!senderInfo?.email) {
    console.error("❌ SMTP_FROM or BREVO_FROM must be set to a valid sender address.");
    process.exit(1);
  }

  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: senderInfo.email,
          ...(senderInfo.name ? { name: senderInfo.name } : {}),
        },
        to: [{ email: process.env.TEST_EMAIL || "test@example.com" }],
        subject: "Brevo Transactional API test",
        htmlContent: "<p>This is a test email sent through Brevo transactional API.</p>",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
      }
    );

    console.log("✅ Test email sent:", response.data);
  } catch (err) {
    console.error("❌ Error sending email:", err.response?.data || err.message || err);
  }
}

sendTestEmail();
