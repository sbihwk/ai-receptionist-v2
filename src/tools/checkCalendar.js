const calendarService = require('../calendarService');

async function handleCheckCalendar(args) {
  try {
    const { service_type, urgency } = args;
    
    let daysAhead = 3;
    if (urgency === 'emergency' || urgency === 'today') {
      daysAhead = 0;
    } else if (urgency === 'this_week') {
      daysAhead = 5;
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const slots = await calendarService.getAvailableSlots({ date: targetDate });

    if (!slots || slots.length === 0) {
      return JSON.stringify({
        available: false,
        message: 'No available slots found. Please take their info and our team will call back to confirm.',
        slots: []
      });
    }

    return JSON.stringify({
      available: true,
      message: `Found ${slots.length} available slot(s) for ${service_type || 'service'}:`,
      slots: slots.map(s => s.label),
      slotDetails: slots
    });

  } catch (err) {
    console.error('[checkCalendar:handleCheckCalendar]', err.message);
    return JSON.stringify({
      available: true,
      message: 'Tomorrow morning at 9 AM or afternoon at 2 PM works. Which do you prefer?',
      slots: ['9:00 AM tomorrow', '2:00 PM tomorrow'],
      error: true
    });
  }
}

module.exports = { handleCheckCalendar };
