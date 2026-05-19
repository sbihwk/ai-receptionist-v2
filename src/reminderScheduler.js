const { CronJob } = require('cron');
require('dotenv').config();
const airtableService = require('./airtableService');
const smsService = require('./smsService');
const emailService = require('./emailService');
const reviewService = require('./reviewService');
const followUpService = require('./followUpService');
const businessConfig = require('./businessConfig');

let dailyDigestSentToday = false;

function startReminderScheduler() {
  const reminderJob = new CronJob('*/15 * * * *', async () => {
    console.log('[reminderScheduler] Running 15-minute reminder check...');
    await process24hReminders();
    await process1hReminders();
    await reviewService.processReviewRequests();
    await followUpService.processFollowUps();
  }, null, false, businessConfig.timeZone);

  const digestJob = new CronJob('0 18 * * *', async () => {
    console.log('[reminderScheduler] Running daily digest...');
    await sendDailyDigest();
  }, null, false, businessConfig.timeZone);

  const resetDigestFlag = new CronJob('0 0 * * *', () => {
    dailyDigestSentToday = false;
  }, null, false, businessConfig.timeZone);

  reminderJob.start();
  digestJob.start();
  resetDigestFlag.start();

  console.log('[reminderScheduler] Started — reminders every 15min, digest at 6pm');
}

async function process24hReminders() {
  try {
    const leads = await airtableService.getLeadsNeedingReminder24h();
    console.log(`[reminderScheduler:24h] Found ${leads.length} reminders to send`);

    for (const lead of leads) {
      const fields = lead.fields;
      const phone = fields.Phone;
      if (!phone) continue;

      try {
        await smsService.sendReminder24h(phone, fields);
        await airtableService.markReminderSent(lead.id, '24h');
        console.log(`[reminderScheduler:24h] Sent to ${phone}`);
      } catch (err) {
        console.error('[reminderScheduler:24h] Failed for', phone, err.message);
      }
    }
  } catch (err) {
    console.error('[reminderScheduler:process24hReminders]', err.message, err);
  }
}

async function process1hReminders() {
  try {
    const leads = await airtableService.getLeadsNeedingReminder1h();
    console.log(`[reminderScheduler:1h] Found ${leads.length} reminders to send`);

    for (const lead of leads) {
      const fields = lead.fields;
      const phone = fields.Phone;
      if (!phone) continue;

      try {
        await smsService.sendReminder1h(phone, fields);
        await airtableService.markReminderSent(lead.id, '1h');
        console.log(`[reminderScheduler:1h] Sent to ${phone}`);
      } catch (err) {
        console.error('[reminderScheduler:1h] Failed for', phone, err.message);
      }
    }
  } catch (err) {
    console.error('[reminderScheduler:process1hReminders]', err.message, err);
  }
}

async function sendDailyDigest() {
  try {
    if (dailyDigestSentToday) {
      console.log('[reminderScheduler:digest] Already sent today, skipping');
      return;
    }

    const stats = await airtableService.getTodayStats();
    await emailService.sendDailyDigest(businessConfig.ownerEmail, stats);
    dailyDigestSentToday = true;
    console.log('[reminderScheduler:digest] Daily digest sent');
  } catch (err) {
    console.error('[reminderScheduler:sendDailyDigest]', err.message, err);
  }
}

module.exports = { startReminderScheduler };
