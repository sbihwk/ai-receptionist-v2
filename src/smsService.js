const twilio = require('twilio');
require('dotenv').config();
const businessConfig = require('./businessConfig');

// ============================================================
// WHATSAPP-FIRST MESSAGING SERVICE
// Sends via WhatsApp if WHATSAPP_ENABLED=true, else falls back to SMS
// For Twilio WhatsApp sandbox: set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
// For production WhatsApp: set TWILIO_WHATSAPP_FROM=whatsapp:+your_number
// ============================================================

const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const SMS_FROM = process.env.TWILIO_FROM;

function getClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Missing Twilio credentials');
  }
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Core send function — tries WhatsApp first, falls back to SMS
async function sendMessage(to, body) {
  try {
    const client = getClient();

    if (WHATSAPP_ENABLED) {
      try {
        // Format number for WhatsApp
        const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const message = await client.messages.create({
          body,
          from: WHATSAPP_FROM,
          to: whatsappTo
        });
        console.log(`[smsService] WhatsApp sent to ${to} — SID: ${message.sid}`);
        return message;
      } catch (waErr) {
        console.warn(`[smsService] WhatsApp failed, falling back to SMS: ${waErr.message}`);
        // Fall through to SMS
      }
    }

    // SMS fallback
    if (!SMS_FROM) {
      console.error('[smsService] No SMS_FROM configured');
      return null;
    }
    const message = await client.messages.create({
      body,
      from: SMS_FROM,
      to
    });
    console.log(`[smsService] SMS sent to ${to} — SID: ${message.sid}`);
    return message;

  } catch (err) {
    console.error('[smsService:sendMessage]', err.message);
    return null;
  }
}

// Keep sendSms as alias for backward compatibility
async function sendSms(to, body) {
  return sendMessage(to, body);
}

// ============================================================
// BOOKING CONFIRMATION — sent to customer after booking
// ============================================================
async function sendConfirmation(to, bookingData) {
  const name = bookingData.full_name || bookingData.name || 'there';
  const slot = bookingData.confirmed_slot || bookingData.slot || 'your scheduled time';
  const address = bookingData.service_address || bookingData.address || '';
  const service = bookingData.service_type || 'appointment';

  const body = WHATSAPP_ENABLED
    ? `✅ *Booking Confirmed!*\n\n` +
      `Hi ${name}! Your ${service} appointment is confirmed.\n\n` +
      `📅 *When:* ${slot}\n` +
      (address ? `📍 *Where:* ${address}\n` : '') +
      `🏢 *Business:* ${businessConfig.name}\n\n` +
      `We will call you 30 minutes before arrival.\n\n` +
      `Questions? Call us: ${businessConfig.phone}\n` +
      `Reply *CANCEL* to cancel your appointment.`
    : `✅ Confirmed - ${businessConfig.name}\n` +
      `Hi ${name}! Your ${service} appointment is set.\n` +
      `📅 ${slot}\n` +
      (address ? `📍 ${address}\n` : '') +
      `Questions? ${businessConfig.phone}\n` +
      `Reply CANCEL to cancel.`;

  return sendMessage(to, body);
}

// ============================================================
// 24H REMINDER
// ============================================================
async function sendReminder24h(to, bookingData) {
  const name = bookingData.FullName || bookingData.full_name || 'there';
  const slot = bookingData.ConfirmedSlot || bookingData.confirmed_slot || 'your scheduled time';

  const body = WHATSAPP_ENABLED
    ? `⏰ *Appointment Reminder*\n\n` +
      `Hi ${name}! Just a reminder — your appointment with *${businessConfig.name}* is tomorrow.\n\n` +
      `📅 *Time:* ${slot}\n\n` +
      `Need to reschedule? Call us: ${businessConfig.phone}`
    : `⏰ Reminder - ${businessConfig.name}\n` +
      `Hi ${name}! Your appointment is tomorrow: ${slot}.\n` +
      `Need to reschedule? Call ${businessConfig.phone}`;

  return sendMessage(to, body);
}

// ============================================================
// 1H REMINDER
// ============================================================
async function sendReminder1h(to, bookingData) {
  const name = bookingData.FullName || bookingData.full_name || 'there';

  const body = WHATSAPP_ENABLED
    ? `🔔 *On the Way!*\n\n` +
      `Hi ${name}! Your appointment with *${businessConfig.name}* is coming up soon.\n\n` +
      `Our team will arrive within the hour and will call you 30 minutes before arrival.\n\n` +
      `Questions? ${businessConfig.phone}`
    : `🔔 ${businessConfig.name} — Almost time!\n` +
      `Hi ${name}! Your appointment is coming up soon.\n` +
      `We'll call 30 minutes before arrival.\n` +
      `Questions? ${businessConfig.phone}`;

  return sendMessage(to, body);
}

// ============================================================
// EMERGENCY ALERT — sent to owner/on-call
// ============================================================
async function sendEmergencyAlert(to, data) {
  const body = `🚨 *EMERGENCY ALERT*\n\n` +
    `*Business:* ${businessConfig.name}\n` +
    `*Type:* ${data.emergency_type}\n` +
    `*Caller:* ${data.caller_phone || 'Unknown'}\n` +
    `*Address:* ${data.caller_address || 'Unknown'}\n` +
    `*Details:* ${data.description || 'None provided'}\n` +
    `*Safety:* ${data.safety_status || 'Unknown'}\n\n` +
    `⚠️ *CALL CUSTOMER IMMEDIATELY*`;

  return sendMessage(to, body);
}

// ============================================================
// OWNER BOOKING ALERT — sent to owner when new booking comes in
// ============================================================
async function sendOwnerBookingAlert(bookingData) {
  const body = WHATSAPP_ENABLED
    ? `📋 *New Booking!*\n\n` +
      `*Business:* ${businessConfig.name}\n` +
      `*Customer:* ${bookingData.full_name}\n` +
      `*Service:* ${bookingData.service_type}\n` +
      `*Time:* ${bookingData.confirmed_slot}\n` +
      (bookingData.service_address ? `*Address:* ${bookingData.service_address}\n` : '') +
      `*Phone:* ${bookingData.callback_phone}\n` +
      `*Issue:* ${bookingData.issue_description || 'N/A'}`
    : `📋 New Booking - ${businessConfig.name}\n` +
      `${bookingData.full_name} - ${bookingData.service_type}\n` +
      `📅 ${bookingData.confirmed_slot}\n` +
      `📞 ${bookingData.callback_phone}\n` +
      `Issue: ${bookingData.issue_description || 'N/A'}`;

  return sendMessage(businessConfig.ownerPhone, body);
}

// ============================================================
// TRANSFER ALERT
// ============================================================
async function sendTransferAlert(to, callData) {
  const body = `📞 *Transfer Request*\n\n` +
    `*Business:* ${businessConfig.name}\n` +
    `*Caller:* ${callData.from || callData.caller_phone || 'Unknown'}\n` +
    `*Reason:* ${callData.reason || 'Caller requested'}\n` +
    `*Notes:* ${callData.notes || 'None'}\n\n` +
    `⚠️ *Call them back NOW*`;

  return sendMessage(to, body);
}

// ============================================================
// REVIEW REQUEST
// ============================================================
async function sendReviewRequest(to, name, serviceType) {
  const body = WHATSAPP_ENABLED
    ? `Hi ${name}! 😊 This is *${businessConfig.name}*.\n\n` +
      `Hope your ${serviceType} went well today! If you're happy with the service, a quick Google review would mean the world to us 🙏\n\n` +
      `👉 ${businessConfig.googleReviewLink}\n\n` +
      `Takes only 30 seconds! Thank you!`
    : `Hi ${name}! This is ${businessConfig.name}. Hope your ${serviceType} went well! ` +
      `A quick Google review would mean a lot 🙏 ${businessConfig.googleReviewLink}`;

  return sendMessage(to, body);
}

// ============================================================
// FOLLOW UP & OTHER MESSAGES
// ============================================================
async function sendFollowUp30Day(to, name, serviceType) {
  const body = `Hi ${name}! This is *${businessConfig.name}* checking in.\n\n` +
    `It's been about a month since your ${serviceType} — everything still going well?\n\n` +
    `If you ever need us, just reply or call ${businessConfig.phone}. Have a great day! 😊`;
  return sendMessage(to, body);
}

async function sendLeadFollowUp(to, name, serviceType) {
  const body = `Hi ${name || 'there'}! This is *${businessConfig.name}*.\n\n` +
    `Just following up — happy to answer any questions about ${serviceType || 'our services'}.\n\n` +
    `No pressure at all! Call us anytime: ${businessConfig.phone}`;
  return sendMessage(to, body);
}

async function sendCancellationConfirm(to, bookingData) {
  const name = bookingData.FullName || bookingData.full_name || 'there';
  const body = `*${businessConfig.name}* — Appointment Cancelled\n\n` +
    `Hi ${name}, your appointment has been cancelled as requested.\n\n` +
    `If you'd like to rebook anytime, just call us at ${businessConfig.phone}.\n` +
    `We're here when you need us! 😊`;
  return sendMessage(to, body);
}

async function sendSeasonalReminder(to, name, serviceType) {
  const body = `Hi ${name}! *${businessConfig.name}* here.\n\n` +
    `Time for your seasonal ${serviceType} tune-up! Book now before the rush.\n\n` +
    `Reply *YES* or call ${businessConfig.phone}`;
  return sendMessage(to, body);
}

module.exports = {
  sendSms,
  sendMessage,
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
