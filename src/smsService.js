const twilio = require('twilio');
require('dotenv').config();
const businessConfig = require('./businessConfig');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = process.env.TWILIO_FROM;

async function sendSms(to, body) {
  try {
    const message = await client.messages.create({
      body,
      from: FROM,
      to
    });
    console.log(`[smsService:sendSms] Sent to ${to} — SID: ${message.sid}`);
    return message;
  } catch (err) {
    console.error('[smsService:sendSms]', err.message, err);
    throw err;
  }
}

async function sendConfirmation(to, bookingData) {
  const body = `✅ Confirmed - ${businessConfig.name}
Hi ${bookingData.full_name || bookingData.name}! Your appointment is set.
📅 ${bookingData.confirmed_slot || bookingData.slot}
📍 ${bookingData.service_address || bookingData.address}
🔧 ${bookingData.service_type}
Tech calls 30min before arrival.
Questions? ${businessConfig.phone}
Reply CANCEL to cancel.`;
  return sendSms(to, body);
}

async function sendReminder24h(to, bookingData) {
  const name = bookingData.FullName || bookingData.full_name || 'there';
  const slot = bookingData.ConfirmedSlot || bookingData.confirmed_slot || 'your scheduled time';
  const body = `⏰ Reminder - ${businessConfig.name}
Hi ${name}! Just a reminder — your appointment is tomorrow: ${slot}.
Our tech will call 30min before arriving.
Need to reschedule? Call ${businessConfig.phone}`;
  return sendSms(to, body);
}

async function sendReminder1h(to, bookingData) {
  const name = bookingData.FullName || bookingData.full_name || 'there';
  const body = `🔔 ${businessConfig.name} — Almost time!
Hi ${name}! Your technician is on the way and will arrive within the hour.
They'll call you about 30 minutes before arrival.
Questions? ${businessConfig.phone}`;
  return sendSms(to, body);
}

async function sendEmergencyAlert(to, data) {
  const body = `🚨 EMERGENCY - ${businessConfig.name}
Type: ${data.emergency_type}
Phone: ${data.caller_phone || 'Unknown'}
Address: ${data.caller_address || 'Unknown'}
Details: ${data.description || 'None provided'}
Safety: ${data.safety_status || 'Unknown'}
⚠️ CALL CUSTOMER IMMEDIATELY`;
  return sendSms(to, body);
}

async function sendOwnerBookingAlert(bookingData) {
  const body = `📋 New Booking - ${businessConfig.name}
${bookingData.full_name} - ${bookingData.service_type}
📍 ${bookingData.service_address}
📅 ${bookingData.confirmed_slot}
📞 ${bookingData.callback_phone}
Issue: ${bookingData.issue_description || 'N/A'}`;
  return sendSms(businessConfig.ownerPhone, body);
}

async function sendTransferAlert(to, callData) {
  const body = `📞 TRANSFER REQUEST - ${businessConfig.name}
Caller: ${callData.from || callData.caller_phone || 'Unknown'}
Reason: ${callData.reason || 'Caller requested'}
Notes: ${callData.notes || 'None'}
⚠️ Call them back NOW`;
  return sendSms(to, body);
}

async function sendReviewRequest(to, name, serviceType) {
  const body = `Hi ${name}! This is ${businessConfig.name}. Hope your ${serviceType} service went well today! If you're happy with the work, a quick Google review would mean the world to us 🙏 ${businessConfig.googleReviewLink} — only takes 30 seconds!`;
  return sendSms(to, body);
}

async function sendFollowUp30Day(to, name, serviceType) {
  const body = `Hi ${name}, this is ${businessConfig.name} checking in! It's been about a month since your ${serviceType} service — everything still working well? If you ever need us, just reply or call ${businessConfig.phone}. Have a great day!`;
  return sendSms(to, body);
}

async function sendLeadFollowUp(to, name, serviceType) {
  const body = `Hi ${name || 'there'}, this is ${businessConfig.name}. Just following up — happy to answer any questions about ${serviceType || 'our services'}. No pressure at all! Call us anytime: ${businessConfig.phone}`;
  return sendSms(to, body);
}

async function sendCancellationConfirm(to, bookingData) {
  const name = bookingData.FullName || bookingData.full_name || 'there';
  const body = `${businessConfig.name} — Appointment Cancelled
Hi ${name}, your appointment has been cancelled as requested.
If you'd like to rebook anytime, just call us at ${businessConfig.phone}.
We're here when you need us!`;
  return sendSms(to, body);
}

async function sendSeasonalReminder(to, name, serviceType) {
  const body = `Hi ${name}! ${businessConfig.name} here. Time for your seasonal ${serviceType} tune-up! Book now before the rush: reply YES or call ${businessConfig.phone}`;
  return sendSms(to, body);
}

module.exports = {
  sendSms,
  sendConfirmation,
  sendReminder24h,
  sendReminder1h,
  sendEmergencyAlert,
  sendOwnerBookingAlert,
  sendTransferAlert,
  sendReviewRequest,
  sendFollowUp30Day,
  sendLeadFollowUp,
  sendCancellationConfirm,
  sendSeasonalReminder
};
