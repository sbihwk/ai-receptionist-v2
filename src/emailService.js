const nodemailer = require('nodemailer');
require('dotenv').config();
const businessConfig = require('./businessConfig');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 465,
    secure: true,
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    tls: { rejectUnauthorized: false },
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendEmail(to, subject, html) {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('[emailService:sendEmail] Missing SMTP credentials');
      return null;
    }
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"${businessConfig.name} AI Receptionist" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    console.log(`[emailService:sendEmail] Sent to ${to} — ID: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error('[emailService:sendEmail]', err.message, err);
    return null;
  }
}

async function sendTechDispatch(techEmail, bookingData) {
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bookingData.service_address || bookingData.address || '')}`;
  const subject = ` New Job Dispatch: ${bookingData.service_type} — ${bookingData.full_name || bookingData.name}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1a56db;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">New Job Dispatch â€” ${businessConfig.name}</h2>
      </div>
      <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;font-weight:bold;width:140px;">Customer:</td><td>${bookingData.full_name || bookingData.name || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Phone:</td><td><a href="tel:${bookingData.callback_phone || bookingData.phone}">${bookingData.callback_phone || bookingData.phone || 'N/A'}</a></td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Address:</td><td><a href="${mapsLink}">${bookingData.service_address || bookingData.address || 'N/A'}</a></td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Service:</td><td>${bookingData.service_type || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Time Window:</td><td>${bookingData.confirmed_slot || bookingData.slot || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Urgency:</td><td>${bookingData.urgency_level || bookingData.urgency || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Issue:</td><td>${bookingData.issue_description || bookingData.issue || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">AI Notes:</td><td>${bookingData.call_notes || bookingData.notes || 'N/A'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">How Found Us:</td><td>${bookingData.how_they_found_us || 'N/A'}</td></tr>
        </table>
        <div style="margin-top:20px;">
          <a href="${mapsLink}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">ðŸ“ Open in Google Maps</a>
        </div>
      </div>
    </div>`;
  return sendEmail(techEmail, subject, html);
}

async function sendEmergencyAlert(ownerEmail, managerEmail, data) {
  const subject = `ðŸš¨ EMERGENCY: ${data.emergency_type} â€” IMMEDIATE ACTION REQUIRED`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#dc2626;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">ðŸš¨ EMERGENCY ALERT â€” ${businessConfig.name}</h2>
      </div>
      <div style="padding:20px;border:2px solid #dc2626;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;font-weight:bold;width:140px;">Type:</td><td style="color:#dc2626;font-weight:bold;">${data.emergency_type}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Caller Phone:</td><td><a href="tel:${data.caller_phone}">${data.caller_phone || 'Unknown'}</a></td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Address:</td><td>${data.caller_address || 'Not provided'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Description:</td><td>${data.description || 'None'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Safety Status:</td><td>${data.safety_status || 'Unknown'}</td></tr>
        </table>
        <p style="margin-top:20px;padding:12px;background:#fef2f2;border-radius:6px;color:#dc2626;font-weight:bold;">
          âš ï¸ Contact on-call technician immediately: ${businessConfig.onCallTechPhone}
        </p>
      </div>
    </div>`;
  const recipients = [ownerEmail, managerEmail].filter(Boolean).join(', ');
  return sendEmail(recipients, subject, html);
}

async function sendComplaintEscalation(managerEmail, callData) {
  const subject = `âš ï¸ Customer Complaint â€” Action Required`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#f59e0b;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Customer Complaint â€” ${businessConfig.name}</h2>
      </div>
      <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;font-weight:bold;width:140px;">Caller:</td><td>${callData.caller_name || callData.from || 'Unknown'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Phone:</td><td>${callData.caller_phone || callData.from || 'Unknown'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Notes:</td><td>${callData.notes || 'No notes'}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Service Interest:</td><td>${callData.service_interest || 'N/A'}</td></tr>
        </table>
        <p style="margin-top:16px;color:#b45309;">Please call this customer back within 1 hour.</p>
      </div>
    </div>`;
  return sendEmail(managerEmail, subject, html);
}

async function sendDailyDigest(ownerEmail, stats) {
  const subject = `ðŸ“Š Daily Report â€” ${businessConfig.name} â€” ${stats.date}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#059669;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">ðŸ“Š Daily Report â€” ${stats.date}</h2>
        <p style="margin:4px 0 0;opacity:0.9;">${businessConfig.name}</p>
      </div>
      <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
          <div style="background:#f0fdf4;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:bold;color:#059669;">${stats.totalCalls}</div>
            <div style="color:#666;font-size:14px;">Calls Handled</div>
          </div>
          <div style="background:#eff6ff;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:bold;color:#1a56db;">${stats.bookingsMade}</div>
            <div style="color:#666;font-size:14px;">Bookings Made</div>
          </div>
          <div style="background:#fef2f2;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:bold;color:#dc2626;">${stats.emergencies}</div>
            <div style="color:#666;font-size:14px;">Emergencies</div>
          </div>
          <div style="background:#fefce8;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:bold;color:#ca8a04;">$${stats.estimatedRevenue.toLocaleString()}</div>
            <div style="color:#666;font-size:14px;">Est. Revenue</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;">Cancellations:</td><td style="text-align:right;">${stats.cancellations}</td></tr>
          <tr><td style="padding:6px 0;">Transfers:</td><td style="text-align:right;">${stats.transfers}</td></tr>
          <tr><td style="padding:6px 0;">Returning Customers:</td><td style="text-align:right;">${stats.returningCustomers}</td></tr>
        </table>
      </div>
    </div>`;
  return sendEmail(ownerEmail, subject, html);
}

module.exports = {
  sendEmail,
  sendTechDispatch,
  sendEmergencyAlert,
  sendComplaintEscalation,
  sendDailyDigest
};

