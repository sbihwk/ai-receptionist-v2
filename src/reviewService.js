const smsService = require('./smsService');
const airtableService = require('./airtableService');

async function sendReviewRequest(phone, name, serviceType) {
  try {
    await smsService.sendReviewRequest(phone, name, serviceType);
    console.log(`[reviewService:sendReviewRequest] Review request sent to ${phone}`);
    return { success: true };
  } catch (err) {
    console.error('[reviewService:sendReviewRequest]', err.message, err);
    throw err;
  }
}

async function processReviewRequests() {
  try {
    const leads = await airtableService.getLeadsNeedingReview();
    console.log(`[reviewService:processReviewRequests] Found ${leads.length} leads needing review requests`);

    for (const lead of leads) {
      const fields = lead.fields;
      const phone = fields.Phone;
      const name = fields.FullName || 'there';
      const serviceType = fields.ServiceType || 'service';

      if (!phone) continue;

      try {
        await sendReviewRequest(phone, name, serviceType);
        await airtableService.markReminderSent(lead.id, 'review');
      } catch (err) {
        console.error('[reviewService:processReviewRequests] Failed for', phone, err.message);
      }
    }

    return { processed: leads.length };
  } catch (err) {
    console.error('[reviewService:processReviewRequests]', err.message, err);
    return { processed: 0 };
  }
}

module.exports = {
  sendReviewRequest,
  processReviewRequests
};
