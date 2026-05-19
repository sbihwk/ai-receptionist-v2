const airtableService = require('../airtableService');
const calendarService = require('../calendarService');
const smsService = require('../smsService');
const emailService = require('../emailService');
const businessConfig = require('../businessConfig');

async function handleRescheduleBooking(args) {
  try {
    const { caller_phone, new_preferred_slot, reason } = args;

    if (!caller_phone) {
      return JSON.stringify({
        success: false,
        message: 'Phone number is required to find the existing booking.'
      });
    }

    // 1. Find existing booking in Airtable
    const booking = await airtableService.findBookingByPhone(caller_phone);
    if (!booking.found) {
      return JSON.stringify({
        success: false,
        message: 'No active booking found for this phone number. Please confirm the number or check if the appointment was already completed.'
      });
    }

    const record = booking.record;
    const fields = record.fields;
    const recordId = record.id;

    // 2. Update Google Calendar event if we have one
    if (fields.CalendarEventId) {
      try {
        const calId = calendarService.getCalendarId(fields.ServiceType || 'general');
        await calendarService.updateEvent(calId, fields.CalendarEventId, {
          summary: `${fields.ServiceType || 'Service'} — ${fields.FullName || 'Customer'} (RESCHEDULED)`,
          description: `RESCHEDULED from ${fields.ConfirmedSlot} to ${new_preferred_slot}\nReason: ${reason || 'Customer request'}\n\nCustomer: ${fields.FullName}\nPhone: ${fields.Phone}\nAddress: ${fields.ServiceAddress}\nIssue: ${fields.IssueDescription}`
        });
      } catch (calErr) {
        console.error('[rescheduleBooking] Calendar update failed:', calErr.message);
      }
    }

    // 3. Update Airtable record
    try {
      await airtableService.updateLeadById(recordId, {
        ConfirmedSlot: new_preferred_slot,
        CallNotes: `${fields.CallNotes || ''}\n[RESCHEDULED] From: ${fields.ConfirmedSlot} To: ${new_preferred_slot}. Reason: ${reason || 'Customer request'}`,
        Reminder24hSent: false,
        Reminder1hSent: false
      });
    } catch (atErr) {
      console.error('[rescheduleBooking] Airtable update failed:', atErr.message);
    }

    // 4. Send updated confirmation SMS
    try {
      await smsService.sendConfirmation(caller_phone, {
        full_name: fields.FullName || 'there',
        confirmed_slot: new_preferred_slot,
        service_address: fields.ServiceAddress || '',
        service_type: fields.ServiceType || 'service'
      });
    } catch (smsErr) {
      console.error('[rescheduleBooking] SMS failed:', smsErr.message);
    }

    // 5. Email tech about change
    try {
      const techEmail = businessConfig.techEmails[fields.ServiceType] || businessConfig.techEmails.general;
      await emailService.sendTechDispatch(techEmail, {
        full_name: fields.FullName,
        callback_phone: fields.Phone,
        service_address: fields.ServiceAddress,
        service_type: fields.ServiceType,
        issue_description: fields.IssueDescription,
        urgency_level: fields.UrgencyLevel,
        confirmed_slot: `RESCHEDULED to: ${new_preferred_slot}`,
        call_notes: `Rescheduled from ${fields.ConfirmedSlot}. Reason: ${reason || 'Customer request'}`
      });
    } catch (emailErr) {
      console.error('[rescheduleBooking] Tech email failed:', emailErr.message);
    }

    console.log(`[rescheduleBooking] Rescheduled booking for ${caller_phone} to ${new_preferred_slot}`);

    return JSON.stringify({
      success: true,
      message: `Appointment rescheduled to ${new_preferred_slot}. Confirmation SMS sent. Technician notified.`,
      newSlot: new_preferred_slot,
      previousSlot: fields.ConfirmedSlot
    });
  } catch (err) {
    console.error('[rescheduleBooking:handleRescheduleBooking]', err.message, err);
    return JSON.stringify({
      success: false,
      message: 'There was an issue rescheduling. I\'ll note this for the team to handle manually.'
    });
  }
}

module.exports = { handleRescheduleBooking };
