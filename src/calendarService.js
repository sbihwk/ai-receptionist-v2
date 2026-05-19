const { google } = require('googleapis');
const path = require('path');

function getAuth() {
  try {
    const keyFile = path.join(__dirname, '..', 'service-account.json');
    const fs = require('fs');
    if (fs.existsSync(keyFile)) {
      const creds = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      return new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
    }
    throw new Error('No service account credentials found');
  } catch (err) {
    console.error('[calendarService] Auth init error:', err.message);
    throw err;
  }
}

async function createEvent({ summary, description, startTime, endTime, calendarId = 'sagargoyat2007@gmail.com' }) {
  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const event = await calendar.events.insert({
      calendarId,
      resource: {
        summary,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime }
      }
    });
    console.log('[calendarService:createEvent] Created event:', event.data.id);
    return event.data;
  } catch (err) {
    console.error('[calendarService:createEvent]', err.message);
    throw err;
  }
}

async function getAvailableSlots({ date, calendarId = 'sagargoyat2007@gmail.com' }) {
  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(8, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(18, 0, 0, 0);
    const response = await calendar.events.list({
      calendarId,
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    const busySlots = (response.data.items || []).map(e => ({
      start: new Date(e.start.dateTime || e.start.date),
      end: new Date(e.end.dateTime || e.end.date)
    }));
    const slots = [];
    for (let hour = 8; hour < 17; hour++) {
      const slotStart = new Date(targetDate);
      slotStart.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(targetDate);
      slotEnd.setHours(hour + 1, 0, 0, 0);
      const busy = busySlots.some(b => slotStart < b.end && slotEnd > b.start);
      if (!busy) slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), label: `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}` });
    }
    return slots;
  } catch (err) {
    console.error('[calendarService:getAvailableSlots]', err.message);
    throw err;
  }
}

module.exports = { createEvent, getAvailableSlots };
