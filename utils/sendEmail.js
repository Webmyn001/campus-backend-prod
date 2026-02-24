const nodemailer = require("nodemailer");
let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Pool connection for better performance in bulk sending
      pool: true,
      maxConnections: 1,
      maxMessages: Infinity
    });
  }
  return transporter;
}

async function sendEmail(to, subject, html) {
  try {
    const mailTransporter = getTransporter();

    await mailTransporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    });

    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error("❌ Email send error:", error);
    throw new Error("Email could not be sent");
  }
}

module.exports = sendEmail;
