const { google } = require('googleapis');
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/calendar'] });
const calendar = google.calendar({ version: 'v3', auth });
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10,0,0,0);
const end = new Date(tomorrow); end.setHours(11,0,0,0);
calendar.events.insert({ calendarId: process.env.GOOGLE_CALENDAR_ID, resource: { summary: 'TEST - AI Receptionist', start: { dateTime: tomorrow.toISOString() }, end: { dateTime: end.toISOString() } } }).then(r => console.log('CALENDAR WORKS:', r.data.htmlLink)).catch(e => console.log('CALENDAR ERROR:', e.message));
