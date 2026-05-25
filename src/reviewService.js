const smsService = require('./smsService');
const airtableService = require('./airtableService');

async function sendReviewRequest(phone, name, serviceType) {
  try {
    await smsService.sendReviewRequest(phone, name, serviceType);
    console.log('[reviewService:sendReviewRequest] Review request sent to ' + phone);
    return { success: true };
  } catch (err) {
    console.error('[reviewService:sendReviewRequest]', err.message);
    throw err;
  }
}

async function processReviewRequests() {
  try {
    const leads = await airtableService.getLeadsNeedingReview();
    console.log('[reviewService:processReviewRequests] Found ' + leads.length + ' leads needing review requests');
    for (const lead of leads) {
      const phone = lead.phone || lead.callback_phone || '';
      const name = lead.customer_name || lead.full_name || 'there';
      const serviceType = lead.service_type || 'service';
      if (!phone) continue;
      try {
        await sendReviewRequest(phone, name, serviceType);
        await airtableService.markReminderSent(lead.id, 'review');
        console.log('[reviewService] Review request sent to ' + phone);
      } catch (err) {
        console.error('[reviewService:processReviewRequests] Failed for', phone, err.message);
      }
    }
    return { processed: leads.length };
  } catch (err) {
    console.error('[reviewService:processReviewRequests]', err.message);
    return { processed: 0 };
  }
}

module.exports = { sendReviewRequest, processReviewRequests };
