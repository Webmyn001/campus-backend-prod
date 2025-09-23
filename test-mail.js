import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendTestEmail() {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: "test@example.com", // this will still land in Mailtrap sandbox
      subject: "Mailtrap Test",
      text: "If you see this, your Mailtrap setup is working!",
    });

    console.log("✅ Test email sent:", info.messageId);
  } catch (err) {
    console.error("❌ Error sending email:", err);
  }
}

sendTestEmail();
