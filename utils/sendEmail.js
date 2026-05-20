const axios = require("axios");

function parseSender(senderString) {
  if (!senderString) return null;
  const match = senderString.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim() || undefined, email: match[2].trim() };
  }
  return { email: senderString.trim() };
}

function buildRecipients(to) {
  if (Array.isArray(to)) {
    return to.map((recipient) => ({ email: recipient }));
  }
  return [{ email: to }];
}

async function sendEmail(to, subject, html) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("Brevo API key is not configured. Set BREVO_API_KEY in .env.");
  }

  const senderInfo = parseSender(process.env.SMTP_FROM || process.env.BREVO_FROM);
  if (!senderInfo || !senderInfo.email) {
    throw new Error("Invalid sender address. Set SMTP_FROM or BREVO_FROM in .env.");
  }

  const payload = {
    sender: {
      email: senderInfo.email,
      ...(senderInfo.name ? { name: senderInfo.name } : {}),
    },
    to: buildRecipients(to),
    subject,
    htmlContent: html,
  };

  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
      }
    );

    console.log(`✅ Email sent to ${to} via Brevo transactional API`);
  } catch (error) {
    const apiError = error.response?.data || error.message || error;
    console.error("❌ Email send error:", apiError);
    throw new Error("Email could not be sent");
  }
}

module.exports = sendEmail;
