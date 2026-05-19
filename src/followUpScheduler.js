const { CronJob } = require('cron');
require('dotenv').config();
const airtableService = require('./airtableService');
const smsService = require('./smsService');
const businessConfig = require('./businessConfig');

function startFollowUpScheduler() {
  const leadFollowUpJob = new CronJob('0 10 * * *', async () => {
    console.log('[followUpScheduler] Running daily lead follow-up check...');
    await processLeadFollowUps();
  }, null, false, businessConfig.timeZone);

  const seasonalJob = new CronJob('0 9 1 * *', async () => {
    console.log('[followUpScheduler] Running monthly seasonal reminder check...');
    await processSeasonalReminders();
  }, null, false, businessConfig.timeZone);

  leadFollowUpJob.start();
  seasonalJob.start();

  console.log('[followUpScheduler] Started — lead follow-ups at 10am, seasonal 1st of month');
}

async function processLeadFollowUps() {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const filterFormula = `AND(
      OR({Intent}='price_inquiry', {Intent}='not_ready', {Intent}='just_browsing'),
      {Status}='LEAD',
      IS_BEFORE({CreatedAt}, '${yesterday.toISOString()}'),
      IS_AFTER({CreatedAt}, '${twoDaysAgo.toISOString()}')
    )`.replace(/\n/g, '');

    const result = await airtableService.lookupByPhone('');
    if (!result.found) return;

    console.log('[followUpScheduler:processLeadFollowUps] Checking for leads to follow up');
  } catch (err) {
    console.error('[followUpScheduler:processLeadFollowUps]', err.message, err);
  }
}

async function processSeasonalReminders() {
  try {
    console.log('[followUpScheduler:processSeasonalReminders] Checking for seasonal HVAC reminders');
  } catch (err) {
    console.error('[followUpScheduler:processSeasonalReminders]', err.message, err);
  }
}

module.exports = { startFollowUpScheduler };
