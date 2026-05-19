require('dotenv').config();

const businessConfig = {
  name: process.env.BUSINESS_NAME || 'Premier HVAC & Plumbing',
  phone: process.env.BUSINESS_PHONE || '+1000000000',
  email: process.env.BUSINESS_EMAIL || 'info@business.com',
  ownerEmail: process.env.OWNER_EMAIL || 'owner@business.com',
  managerEmail: process.env.MANAGER_EMAIL || 'manager@business.com',
  ownerPhone: process.env.OWNER_PHONE || '+1000000000',
  emergencySmsTo: process.env.EMERGENCY_SMS_TO || process.env.OWNER_PHONE || '+1000000000',
  onCallTechPhone: process.env.ON_CALL_TECH_PHONE || '+1000000000',
  averageTicketValue: parseInt(process.env.AVERAGE_TICKET_VALUE, 10) || 450,

  dispatchFee: process.env.DISPATCH_FEE || '$89',
  hours: process.env.BUSINESS_HOURS || 'Monday-Friday 8am-6pm, Saturday 9am-2pm',
  serviceAreas: process.env.SERVICE_AREAS || 'Your City and surrounding areas',
  timeZone: process.env.TIME_ZONE || 'America/Chicago',

  googleReviewLink: process.env.GOOGLE_REVIEW_LINK || 'https://g.page/r/YOUR_REVIEW_LINK',

  techEmails: {
    hvac: process.env.HVAC_TECH_EMAIL || 'hvac@business.com',
    plumbing: process.env.PLUMBING_TECH_EMAIL || 'plumbing@business.com',
    electrical: process.env.ELECTRICAL_TECH_EMAIL || 'electrical@business.com',
    general: process.env.GENERAL_TECH_EMAIL || 'general@business.com',
    other: process.env.GENERAL_TECH_EMAIL || 'general@business.com'
  },

  calendarIds: {
    hvac: process.env.HVAC_CALENDAR_ID || 'primary',
    plumbing: process.env.PLUMBING_CALENDAR_ID || 'primary',
    electrical: process.env.ELECTRICAL_CALENDAR_ID || 'primary',
    general: process.env.DEFAULT_CALENDAR_ID || 'primary',
    other: process.env.DEFAULT_CALENDAR_ID || 'primary'
  },

  businessHoursParsed: parseBusinessHours(process.env.BUSINESS_HOURS || 'Monday-Friday 8am-6pm, Saturday 9am-2pm'),

  sunClosed: true
};

function parseBusinessHours(hoursStr) {
  const schedule = {
    0: null, // Sunday
    1: { open: 8, close: 18 },
    2: { open: 8, close: 18 },
    3: { open: 8, close: 18 },
    4: { open: 8, close: 18 },
    5: { open: 8, close: 18 },
    6: { open: 9, close: 14 } // Saturday
  };

  try {
    const parts = hoursStr.split(',').map(s => s.trim());
    for (const part of parts) {
      const match = part.match(/(\w[\w\s-]*?)\s+(\d{1,2})(am|pm)\s*-\s*(\d{1,2})(am|pm)/i);
      if (!match) continue;

      const dayRange = match[1].trim();
      let openHour = parseInt(match[2], 10);
      const openAmPm = match[3].toLowerCase();
      let closeHour = parseInt(match[4], 10);
      const closeAmPm = match[5].toLowerCase();

      if (openAmPm === 'pm' && openHour !== 12) openHour += 12;
      if (openAmPm === 'am' && openHour === 12) openHour = 0;
      if (closeAmPm === 'pm' && closeHour !== 12) closeHour += 12;
      if (closeAmPm === 'am' && closeHour === 12) closeHour = 0;

      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      if (dayRange.includes('-')) {
        const [startDay, endDay] = dayRange.split('-').map(d => d.trim().toLowerCase());
        const startIdx = dayNames.indexOf(startDay);
        const endIdx = dayNames.indexOf(endDay);
        if (startIdx >= 0 && endIdx >= 0) {
          for (let i = startIdx; i <= endIdx; i++) {
            schedule[i] = { open: openHour, close: closeHour };
          }
        }
      } else {
        const idx = dayNames.indexOf(dayRange.toLowerCase());
        if (idx >= 0) {
          schedule[idx] = { open: openHour, close: closeHour };
        }
      }
    }
  } catch (err) {
    console.error('[businessConfig:parseBusinessHours]', err.message, err);
  }

  return schedule;
}

function isWithinBusinessHours() {
  const now = new Date();
  const options = { timeZone: businessConfig.timeZone };
  const localStr = now.toLocaleString('en-US', options);
  const local = new Date(localStr);
  const day = local.getDay();
  const hour = local.getHours();
  const minutes = local.getMinutes();
  const currentTime = hour + minutes / 60;

  const todayHours = businessConfig.businessHoursParsed[day];
  if (!todayHours) return false;
  return currentTime >= todayHours.open && currentTime < todayHours.close;
}

businessConfig.isWithinBusinessHours = isWithinBusinessHours;

module.exports = businessConfig;
