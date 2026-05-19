const airtableService = require('../airtableService');
const calendarService = require('../calendarService');
const smsService = require('../smsService');
const emailService = require('../emailService');
const businessConfig = require('../businessConfig');

async function handleCancelBooking(args) {
  try {
    const { caller_phone, reason, offer_reschedule } = args;

    if (!caller_phone) {
      return JSON.stringify({
        success: false,
        message: 'Phone number is required to find the existing booking.'
      });
    }

    // 1. Find booking in Airtable
    const booking = await airtableService.findBookingByPhone(caller_phone);
    if (!booking.found) {
      return JSON.stringify({
        success: false,
        message: 'No active booking found for this phone number.'
      });
    }

    const record = booking.record;
    const fields = record.fields;
    const recordId = record.id;

    // 2. Delete/cancel Google Calendar event
    if (fields.CalendarEventId) {
      try {
        const calId = calendarService.getCalendarId(fields.ServiceType || 'general');
        await calendarService.deleteEvent(calId, fields.CalendarEventId);
      } catch (calErr) {
        console.error('[cancelBooking] Calendar deletion failed:', calErr.message);
      }
    }

    // 3. Mark cancelled in Airtable
    try {
      await airtableService.updateLeadById(recordId, {
        Status: 'CANCELLED',
        CallNotes: `${fields.CallNotes || ''}\n[CANCELLED] Reason: ${reason || 'Customer request'}. Offer reschedule: ${offer_reschedule ? 'Yes' : 'No'}`
      });
    } catch (atErr) {
      console.error('[cancelBooking] Airtable update failed:', atErr.message);
    }

    // 4. Send cancellation confirmation SMS
    try {
      await smsService.sendCancellationConfirm(caller_phone, {
        FullName: fields.FullName || 'there',
        ConfirmedSlot: fields.ConfirmedSlot
      });
    } catch (smsErr) {
      console.error('[cancelBooking] SMS failed:', smsErr.message);
    }

    // 5. Email manager
    try {
      await emailService.sendEmail(
        businessConfig.managerEmail,
        `Cancellation — ${fields.FullName || 'Customer'} — ${fields.ServiceType || 'Service'}`,
        `<div style="font-family:Arial,sans-serif;">
          <h3>Appointment Cancelled</h3>
          <p><strong>Customer:</strong> ${fields.FullName || 'N/A'}</p>
          <p><strong>Phone:</strong> ${fields.Phone || 'N/A'}</p>
          <p><strong>Service:</strong> ${fields.ServiceType || 'N/A'}</p>
          <p><strong>Was Scheduled:</strong> ${fields.ConfirmedSlot || 'N/A'}</p>
          <p><strong>Reason:</strong> ${reason || 'Customer request'}</p>
          <p><strong>Offered Reschedule:</strong> ${offer_reschedule ? 'Yes' : 'No'}</p>
        </div>`
      );
    } catch (emailErr) {
      console.error('[cancelBooking] Manager email failed:', emailErr.message);
    }

    console.log(`[cancelBooking] Cancelled booking for ${caller_phone}`);

    const responseMessage = offer_reschedule
      ? 'Appointment cancelled. Would you like me to find a new time that works better?'
      : 'Appointment cancelled. Confirmation sent via text. We\'re here whenever you need us!';

    return JSON.stringify({
      success: true,
      message: responseMessage,
      cancelledSlot: fields.ConfirmedSlot
    });
  } catch (err) {
    console.error('[cancelBooking:handleCancelBooking]', err.message, err);
    return JSON.stringify({
      success: false,
      message: 'There was an issue processing the cancellation. I\'ll note this for the team.'
    });
  }
}

module.exports = { handleCancelBooking };
