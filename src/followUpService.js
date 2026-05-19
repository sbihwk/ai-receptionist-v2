const smsService = require('./smsService');
const airtableService = require('./airtableService');

async function send30DayFollowUp(phone, name, serviceType) {
  try {
    await smsService.sendFollowUp30Day(phone, name, serviceType);
    console.log(`[followUpService:send30DayFollowUp] Follow-up sent to ${phone}`);
    return { success: true };
  } catch (err) {
    console.error('[followUpService:send30DayFollowUp]', err.message, err);
    throw err;
  }
}

async function scheduleSeasonalReminder(phone, name, serviceType) {
  try {
    if (serviceType && serviceType.toLowerCase() === 'hvac') {
      console.log(`[followUpService:scheduleSeasonalReminder] HVAC seasonal reminder noted for ${phone} in 6 months`);
    }
    return { success: true };
  } catch (err) {
    console.error('[followUpService:scheduleSeasonalReminder]', err.message, err);
    throw err;
  }
}

async function processFollowUps() {
  try {
    const leads = await airtableService.getLeadsNeedingFollowUp30();
    console.log(`[followUpService:processFollowUps] Found ${leads.length} leads needing 30-day follow-up`);

    for (const lead of leads) {
      const fields = lead.fields;
      const phone = fields.Phone;
      const name = fields.FullName || 'there';
      const serviceType = fields.ServiceType || 'service';

      if (!phone) continue;

      try {
        await send30DayFollowUp(phone, name, serviceType);
        await airtableService.markReminderSent(lead.id, 'followup30');
        await scheduleSeasonalReminder(phone, name, serviceType);
      } catch (err) {
        console.error('[followUpService:processFollowUps] Failed for', phone, err.message);
      }
    }

    return { processed: leads.length };
  } catch (err) {
    console.error('[followUpService:processFollowUps]', err.message, err);
    return { processed: 0 };
  }
}

module.exports = {
  send30DayFollowUp,
  scheduleSeasonalReminder,
  processFollowUps
};
