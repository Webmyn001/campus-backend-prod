const BulkEmailQueue = require("../Models/BulkEmailQueue");
const sendEmail = require("../utils/sendEmail");

const DAILY_BULK_LIMIT = Number(process.env.BULK_EMAIL_DAILY_LIMIT) || 60;

function buildHtml(body, name) {
  const personalizedBody = body.replace(/{{name}}/g, name).replace(/\n/g, "<br>");
  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #6366f1; margin: 0;">CampusCrave</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">Official Communication</p>
      </div>
      <div style="margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 15px;">
        <h2 style="color: #1f2937; margin: 0; font-size: 18px;">%SUBJECT%</h2>
      </div>
      <div style="color: #374151; font-size: 15px; margin-bottom: 30px;">
        ${personalizedBody}
      </div>
      <div style="background: #eff6ff; padding: 15px; border-radius: 8px; border: 1px solid #dbeafe; margin-bottom: 25px;">
        <p style="margin: 0; font-size: 13px; color: #1e40af;">
          <strong>Pro-Tip:</strong> Always check our marketplace for the latest campus deals and verified student services!
        </p>
      </div>
      <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Thank you for being a part of the CampusCrave community. We are building the best marketplace for students, by students.
      </p>
      <p style="margin-bottom: 0;">Best regards,</p>
      <p style="margin-top: 5px;"><strong>The CampusCrave Team</strong></p>
      <div style="text-align: center; font-size: 11px; color: #9ca3af; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
        <p>&copy; ${new Date().getFullYear()} CampusCrave Nigeria. All rights reserved.</p>
        <p style="margin-top: 5px;">You are receiving this email because you registered on CampusCrave.</p>
      </div>
    </div>
  `;
}

function getTodayStart() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart;
}

async function getTodaySentCount() {
  return BulkEmailQueue.countDocuments({
    status: "sent",
    sentAt: { $gte: getTodayStart() },
  });
}

async function enqueueBulkEmails(subject, body, emails, userMap = {}) {
  const queueDocs = emails.map((email) => {
    const name = userMap[email] || "CampusCraver";
    return {
      email,
      subject,
      html: buildHtml(body, name).replace("%SUBJECT%", subject),
    };
  });

  return BulkEmailQueue.insertMany(queueDocs);
}

async function processBulkEmailQueue(limitOverride) {
  const sentToday = await getTodaySentCount();
  const remainingCapacity = Math.max(0, DAILY_BULK_LIMIT - sentToday);
  const sendLimit = typeof limitOverride === "number" ? Math.min(limitOverride, remainingCapacity) : remainingCapacity;

  if (sendLimit <= 0) {
    const queued = await BulkEmailQueue.countDocuments({ status: "pending" });
    return { sentToday, remainingCapacity, processed: 0, queued };
  }

  const pendingItems = await BulkEmailQueue.find({ status: "pending" })
    .sort({ createdAt: 1 })
    .limit(sendLimit);

  let sent = 0;
  let failed = 0;

  for (const item of pendingItems) {
    try {
      await sendEmail(item.email, item.subject, item.html);
      item.status = "sent";
      item.sentAt = new Date();
      item.lastAttemptAt = new Date();
      item.attempts += 1;
      item.lastError = undefined;
      await item.save();
      sent += 1;
    } catch (error) {
      item.attempts += 1;
      item.lastAttemptAt = new Date();
      item.lastError = error.message || String(error);
      if (item.attempts >= 3) {
        item.status = "failed";
      }
      await item.save();
      failed += 1;
    }
  }

  const queued = await BulkEmailQueue.countDocuments({ status: "pending" });
  return {
    sentToday,
    remainingCapacity: Math.max(0, DAILY_BULK_LIMIT - (sentToday + sent)),
    processed: sent + failed,
    sent,
    failed,
    queued,
  };
}

module.exports = {
  enqueueBulkEmails,
  processBulkEmailQueue,
  getTodaySentCount,
};
