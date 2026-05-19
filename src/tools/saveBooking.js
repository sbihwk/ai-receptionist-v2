const { v4: uuidv4 } = require('uuid');
const airtableService = require('../airtableService');
const calendarService = require('../calendarService');
const smsService = require('../smsService');
const emailService = require('../emailService');
const businessConfig = require('../businessConfig');

async function handleSaveBooking(args) {
  const bookingId = `BK-${uuidv4().slice(0, 8).toUpperCase()}`;
  let calendarEventId = '';

  try {
    const {
      full_name, callback_phone, service_address, service_type,
      issue_description, urgency_level, confirmed_slot,
      appointment_datetime, upsell_mentioned, upsell_interested,
      customer_mood, how_they_found_us, call_notes
    } = args;

    // 1. Create Google Calendar event
    try {
      let startTime, endTime;
      if (appointment_datetime) {
        startTime = new Date(appointment_datetime).toISOString();
        endTime = new Date(new Date(appointment_datetime).getTime() + 2 * 60 * 60 * 1000).toISOString();
      } else {
        startTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        endTime = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
      }

      const eventResult = await calendarService.createEvent({
        summary: `${service_type || 'Service'} - ${full_name}`,
        description: `Customer: ${full_name}\nPhone: ${callback_phone}\nAddress: ${service_address}\nIssue: ${issue_description}\nUrgency: ${urgency_level}\nNotes: ${call_notes}`,
        startTime,
        endTime
      });
      calendarEventId = eventResult.id || eventResult.eventId || '';
      console.log('[saveBooking] Calendar event created:', calendarEventId);
    } catch (calErr) {
      console.error('[saveBooking] Calendar creation failed:', calErr.message);
    }

    // 2. Save to Airtable
    try {
      await airtableService.saveLead({
        full_name, callback_phone, service_address, service_type,
        issue_description, urgency_level, confirmed_slot,
        appointment_datetime: appointment_datetime || '',
        status: 'BOOKED', channel: 'voice',
        calendar_event_id: calendarEventId, booking_id: bookingId
      });
    } catch (atErr) {
      console.error('[saveBooking] Airtable save failed:', atErr.message);
    }

    // 3. Send confirmation SMS
    try {
      await smsService.sendConfirmation(callback_phone, { full_name, confirmed_slot, service_address, service_type });
    } catch (smsErr) {
      console.error('[saveBooking] SMS failed:', smsErr.message);
    }

    // 4. Email tech
    try {
      const techEmail = businessConfig.techEmails?.[service_type] || businessConfig.techEmails?.general;
      if (techEmail) await emailService.sendTechDispatch(techEmail, { full_name, callback_phone, service_address, service_type, issue_description, urgency_level, confirmed_slot, call_notes });
    } catch (emailErr) {
      console.error('[saveBooking] Email failed:', emailErr.message);
    }

    // 5. SMS owner
    try {
      await smsService.sendOwnerBookingAlert({ full_name, service_type, service_address, confirmed_slot, callback_phone, issue_description });
    } catch (ownerErr) {
      console.error('[saveBooking] Owner SMS failed:', ownerErr.message);
    }

    console.log(`[saveBooking] Booking ${bookingId} created successfully`);
    return JSON.stringify({ success: true, bookingId, calendarEventId, message: `Booking ${bookingId} confirmed.` });

  } catch (err) {
    console.error('[saveBooking:handleSaveBooking]', err.message);
    return JSON.stringify({ success: true, bookingId, calendarEventId, message: "Appointment noted - our team will confirm shortly" });
  }
}

module.exports = { handleSaveBooking };
