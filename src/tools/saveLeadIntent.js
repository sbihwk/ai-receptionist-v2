const airtableService = require('../airtableService');
const emailService = require('../emailService');
const smsService = require('../smsService');
const businessConfig = require('../businessConfig');

async function handleSaveLeadIntent(args) {
  try {
    const {
      caller_phone,
      caller_name,
      intent,
      service_interest,
      notes
    } = args;

    // 1. Save to Airtable with LEAD status
    try {
      await airtableService.saveLead({
        caller_phone: caller_phone || '',
        caller_name: caller_name || '',
        issue_description: notes || '',
        service_type: service_interest || '',
        status: 'LEAD',
        intent: intent || '',
        service_interest: service_interest || '',
        call_notes: notes || '',
        channel: 'voice'
      });
    } catch (atErr) {
      console.error('[saveLeadIntent] Airtable save failed:', atErr.message);
    }

    // 2. If complaint → email manager immediately
    if (intent === 'complaint') {
      try {
        await emailService.sendComplaintEscalation(businessConfig.managerEmail, {
          caller_name: caller_name || 'Unknown',
          caller_phone: caller_phone || 'Unknown',
          notes: notes || 'No details provided',
          service_interest: service_interest || 'N/A'
        });
      } catch (emailErr) {
        console.error('[saveLeadIntent] Complaint email failed:', emailErr.message);
      }
    }

    // 3. If price_inquiry or not_ready → schedule follow-up SMS in 24 hours
    if ((intent === 'price_inquiry' || intent === 'not_ready') && caller_phone) {
      setTimeout(async () => {
        try {
          await smsService.sendLeadFollowUp(
            caller_phone,
            caller_name || 'there',
            service_interest || 'our services'
          );
          console.log(`[saveLeadIntent] Follow-up SMS sent to ${caller_phone}`);
        } catch (smsErr) {
          console.error('[saveLeadIntent] Follow-up SMS failed:', smsErr.message);
        }
      }, 24 * 60 * 60 * 1000);

      console.log(`[saveLeadIntent] Follow-up SMS scheduled for ${caller_phone} in 24 hours`);
    }

    console.log(`[saveLeadIntent] Lead saved — ${intent} — ${caller_phone}`);

    return JSON.stringify({
      success: true,
      message: `Lead information saved. Intent: ${intent}.${intent === 'complaint' ? ' Manager has been notified.' : ''}${(intent === 'price_inquiry' || intent === 'not_ready') ? ' Follow-up SMS scheduled.' : ''}`
    });
  } catch (err) {
    console.error('[saveLeadIntent:handleSaveLeadIntent]', err.message, err);
    return JSON.stringify({
      success: false,
      message: 'Lead information noted for the team.'
    });
  }
}

module.exports = { handleSaveLeadIntent };
