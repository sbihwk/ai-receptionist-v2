const smsService = require('../smsService');
const emailService = require('../emailService');
const airtableService = require('../airtableService');
const businessConfig = require('../businessConfig');
const twilio = require('twilio');
require('dotenv').config();

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function handleFlagEmergency(args) {
  try {
    const {
      emergency_type,
      caller_address,
      caller_phone,
      description,
      safety_status
    } = args;

    console.log(`[flagEmergency] 🚨 EMERGENCY: ${emergency_type} — ${caller_phone}`);

    // 1. Immediately SMS emergency contacts
    try {
      await smsService.sendEmergencyAlert(businessConfig.emergencySmsTo, {
        emergency_type,
        caller_phone: caller_phone || 'Unknown',
        caller_address: caller_address || 'Unknown',
        description: description || 'No details provided',
        safety_status: safety_status || 'unknown'
      });
    } catch (smsErr) {
      console.error('[flagEmergency] Emergency SMS failed:', smsErr.message);
    }

    // 2. Automated call to owner
    try {
      const twiml = `<Response><Say voice="alice">Emergency alert from ${businessConfig.name}. ${emergency_type.replace(/_/g, ' ')} reported. Caller phone: ${caller_phone || 'unknown'}. Address: ${caller_address || 'not provided'}. ${description || ''}. Please respond immediately.</Say></Response>`;
      await twilioClient.calls.create({
        twiml,
        to: businessConfig.ownerPhone,
        from: process.env.TWILIO_FROM
      });
    } catch (callErr) {
      console.error('[flagEmergency] Emergency call failed:', callErr.message);
    }

    // 3. Email owner + manager
    try {
      await emailService.sendEmergencyAlert(
        businessConfig.ownerEmail,
        businessConfig.managerEmail,
        {
          emergency_type,
          caller_phone: caller_phone || 'Unknown',
          caller_address: caller_address || 'Not provided',
          description: description || 'None',
          safety_status: safety_status || 'Unknown'
        }
      );
    } catch (emailErr) {
      console.error('[flagEmergency] Emergency email failed:', emailErr.message);
    }

    // 4. Save to Airtable with EMERGENCY flag
    try {
      await airtableService.saveLead({
        caller_phone: caller_phone || '',
        service_address: caller_address || '',
        issue_description: `EMERGENCY: ${emergency_type} — ${description || 'No details'}`,
        urgency_level: 'emergency',
        status: 'EMERGENCY',
        emergency_type,
        safety_status: safety_status || 'unknown',
        channel: 'voice'
      });
    } catch (atErr) {
      console.error('[flagEmergency] Airtable save failed:', atErr.message);
    }

    return JSON.stringify({
      success: true,
      techPhone: businessConfig.onCallTechPhone,
      message: `Emergency flagged. On-call technician: ${businessConfig.onCallTechPhone}. Owner and manager have been notified via SMS, call, and email.`
    });
  } catch (err) {
    console.error('[flagEmergency:handleFlagEmergency]', err.message, err);
    return JSON.stringify({
      success: false,
      techPhone: businessConfig.onCallTechPhone,
      message: 'Emergency was flagged but there was a partial error. The on-call tech number is ' + businessConfig.onCallTechPhone
    });
  }
}

module.exports = { handleFlagEmergency };
