const { google } = require('googleapis');
require('dotenv').config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '19drFlTjJYpwDqB6ryxTaoeH4YG1H8BWY-v76dtWNUNg';

const SHEETS = {
  leads: 'Leads',
  conversations: 'ConversationHistory',
  analytics: 'Analytics'
};

// Column headers for each sheet
const LEAD_HEADERS = [
  'id', 'customer_name', 'phone', 'address', 'service_type', 'issue',
  'urgency', 'booking_status', 'businessId', 'conversationId',
  'lead_score', 'ReviewRequestSent', 'FollowUp30DaySent',
  'Reminder24hSent', 'Reminder1hSent', 'timestamp', 'calendar_event_id', 'booking_id'
];

const CONVERSATION_HEADERS = ['CallSid', 'Transcript', 'Summary', 'timestamp'];

const ANALYTICS_HEADERS = [
  'CallSid', 'BookingMade', 'EmergencyDetected', 'revenue_opportunity',
  'detected_issue', 'call_summary', 'recommended_followup', 'IssueCategory', 'timestamp'
];

function getAuth() {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    }
    throw new Error('No Google service account credentials found');
  } catch (err) {
    console.error('[sheetsService] Auth error:', err.message);
    throw err;
  }
}

async function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// Ensure a sheet tab exists with correct headers
async function ensureSheet(sheets, sheetName, headers) {
  try {
    // Try to read the sheet - if it fails, create it
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:A1`
    });
    // Check if headers exist
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
    }
  } catch (err) {
    // Sheet doesn't exist, create it
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{
            addSheet: { properties: { title: sheetName } }
          }]
        }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
    } catch (createErr) {
      console.error('[sheetsService] Could not create sheet:', sheetName, createErr.message);
    }
  }
}

// Get all rows from a sheet as array of objects
async function getAllRows(sheets, sheetName, headers) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:Z10000`
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return []; // only headers or empty
    return rows.slice(1).map((row, index) => {
      const obj = { _rowIndex: index + 2 }; // 1-based, +1 for header
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });
  } catch (err) {
    console.error('[sheetsService] getAllRows error:', err.message);
    return [];
  }
}

// Append a row to a sheet
async function appendRow(sheets, sheetName, headers, data) {
  await ensureSheet(sheets, sheetName, headers);
  const row = headers.map(h => {
    const val = data[h];
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return String(val);
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [row] }
  });
}

// Update a specific row by row index
async function updateRow(sheets, sheetName, headers, rowIndex, updates) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A${rowIndex}:Z${rowIndex}`
  });
  const existing = res.data.values?.[0] || [];
  const updated = headers.map((h, i) => {
    if (updates[h] !== undefined) {
      const val = updates[h];
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      return String(val);
    }
    return existing[i] || '';
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: 'RAW',
    resource: { values: [updated] }
  });
}

// ─── PUBLIC API (same as airtableService.js) ───────────────────────────────

async function saveLead(data) {
  try {
    const sheets = await getSheets();
    const id = `lead_${Date.now()}`;
    const fields = {
      id,
      customer_name: data.full_name || data.caller_name || '',
      phone: data.callback_phone || data.caller_phone || '',
      address: data.service_address || '',
      service_type: data.service_type || '',
      issue: data.issue_description || '',
      urgency: data.urgency_level || 'flexible',
      booking_status: data.status || 'BOOKED',
      businessId: data.businessId || 'default',
      conversationId: data.conversationId || '',
      lead_score: data.lead_score || '',
      ReviewRequestSent: false,
      FollowUp30DaySent: false,
      Reminder24hSent: false,
      Reminder1hSent: false,
      timestamp: data.appointment_datetime || new Date().toISOString(),
      calendar_event_id: data.calendar_event_id || '',
      booking_id: data.booking_id || ''
    };
    await appendRow(sheets, SHEETS.leads, LEAD_HEADERS, fields);
    console.log('[sheetsService] Lead saved:', id);
    return { id, fields };
  } catch (err) {
    console.error('[sheetsService:saveLead]', err.message);
    return null;
  }
}

async function updateLeadById(recordId, updates) {
  try {
    const sheets = await getSheets();
    const rows = await getAllRows(sheets, SHEETS.leads, LEAD_HEADERS);
    const row = rows.find(r => r.id === recordId);
    if (!row) return null;
    await updateRow(sheets, SHEETS.leads, LEAD_HEADERS, row._rowIndex, updates);
    console.log('[sheetsService] Lead updated:', recordId);
    return { id: recordId };
  } catch (err) {
    console.error('[sheetsService:updateLeadById]', err.message);
    throw err;
  }
}

async function updateLead(recordId, updates) {
  return updateLeadById(recordId, updates);
}

async function saveConversation(callSid, transcript, summary) {
  try {
    const sheets = await getSheets();
    await appendRow(sheets, SHEETS.conversations, CONVERSATION_HEADERS, {
      CallSid: callSid,
      Transcript: typeof transcript === 'string' ? transcript : JSON.stringify(transcript),
      Summary: summary || '',
      timestamp: new Date().toISOString()
    });
    console.log('[sheetsService] Conversation saved:', callSid);
    return { callSid };
  } catch (err) {
    console.error('[sheetsService:saveConversation]', err.message);
    return null;
  }
}

async function saveAnalytics(data) {
  try {
    const sheets = await getSheets();
    await appendRow(sheets, SHEETS.analytics, ANALYTICS_HEADERS, {
      CallSid: data.callSid || '',
      BookingMade: data.bookingMade || false,
      EmergencyDetected: data.emergencyDetected || false,
      revenue_opportunity: String(data.revenueOpportunity || '0'),
      detected_issue: data.serviceType || '',
      call_summary: data.callSummary || '',
      recommended_followup: data.recommendedFollowup || '',
      IssueCategory: data.callClassification || '',
      timestamp: new Date().toISOString()
    });
    console.log('[sheetsService] Analytics saved');
    return { saved: true };
  } catch (err) {
    console.error('[sheetsService:saveAnalytics]', err.message);
    return null;
  }
}

async function lookupByPhone(phone) {
  try {
    const sheets = await getSheets();
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const rows = await getAllRows(sheets, SHEETS.leads, LEAD_HEADERS);
    const matches = rows.filter(r => r.phone === cleanPhone || r.phone === phone);
    if (matches.length === 0) return { found: false };
    matches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const latest = matches[0];
    const bookedRecords = matches.filter(r => r.booking_status === 'BOOKED' || r.booking_status === 'COMPLETED');
    return {
      found: true,
      recordId: latest.id,
      name: latest.customer_name || '',
      lastServiceDate: latest.timestamp || '',
      lastServiceType: latest.service_type || '',
      totalJobs: bookedRecords.length,
      lifetimeValue: bookedRecords.length * (parseInt(process.env.AVERAGE_TICKET_VALUE, 10) || 450),
      allRecords: matches
    };
  } catch (err) {
    console.error('[sheetsService:lookupByPhone]', err.message);
    return { found: false };
  }
}

async function getLeadsNeedingReminder24h() {
  try {
    const sheets = await getSheets();
    const rows = await getAllRows(sheets, SHEETS.leads, LEAD_HEADERS);
    const now = Date.now();
    return rows.filter(r => {
      if (r.Reminder24hSent === 'TRUE' || r.booking_status !== 'BOOKED' || !r.timestamp) return false;
      const appt = new Date(r.timestamp).getTime();
      const diff = appt - now;
      return diff >= 23 * 3600000 && diff <= 26 * 3600000;
    });
  } catch (err) { return []; }
}

async function getLeadsNeedingReminder1h() {
  try {
    const sheets = await getSheets();
    const rows = await getAllRows(sheets, SHEETS.leads, LEAD_HEADERS);
    const now = Date.now();
    return rows.filter(r => {
      if (r.Reminder1hSent === 'TRUE' || r.booking_status !== 'BOOKED' || !r.timestamp) return false;
      const appt = new Date(r.timestamp).getTime();
      const diff = appt - now;
      return diff >= 45 * 60000 && diff <= 90 * 60000;
    });
  } catch (err) { return []; }
}

async function markReminderSent(recordId, type) {
  try {
    const updates = {};
    if (type === '24h') updates.Reminder24hSent = true;
    if (type === '1h') updates.Reminder1hSent = true;
    if (type === 'review') updates.ReviewRequestSent = true;
    if (type === 'followup30') updates.FollowUp30DaySent = true;
    return await updateLeadById(recordId, updates);
  } catch (err) { throw err; }
}

async function getTodayStats() {
  try {
    const sheets = await getSheets();
    const rows = await getAllRows(sheets, SHEETS.analytics, ANALYTICS_HEADERS);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayRows = rows.filter(r => r.timestamp && new Date(r.timestamp) >= startOfDay);
    return {
      totalCalls: todayRows.length,
      bookingsMade: todayRows.filter(r => r.BookingMade === 'TRUE').length,
      emergencies: todayRows.filter(r => r.EmergencyDetected === 'TRUE').length,
      estimatedRevenue: todayRows.filter(r => r.BookingMade === 'TRUE').length * (parseInt(process.env.AVERAGE_TICKET_VALUE, 10) || 450),
      date: new Date().toLocaleDateString('en-US', { timeZone: process.env.TIME_ZONE || 'America/Chicago' })
    };
  } catch (err) {
    return { totalCalls: 0, bookingsMade: 0, emergencies: 0, estimatedRevenue: 0, date: new Date().toLocaleDateString() };
  }
}

async function getLeadsNeedingReview() {
  try {
    const sheets = await getSheets();
    const rows = await getAllRows(sheets, SHEETS.leads, LEAD_HEADERS);
    const fourHoursAgo = Date.now() - 4 * 3600000;
    return rows.filter(r => {
      if (r.ReviewRequestSent === 'TRUE' || r.booking_status !== 'BOOKED' || !r.timestamp) return false;
      return new Date(r.timestamp).getTime() < fourHoursAgo;
    });
  } catch (err) { return []; }
}

async function getLeadsNeedingFollowUp30() {
  try {
    const sheets = await getSheets();
    const rows = await getAllRows(sheets, SHEETS.leads, LEAD_HEADERS);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600000;
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 3600000;
    return rows.filter(r => {
      if (r.FollowUp30DaySent === 'TRUE' || r.booking_status !== 'BOOKED' || !r.timestamp) return false;
      const t = new Date(r.timestamp).getTime();
      return t < thirtyDaysAgo && t > thirtyOneDaysAgo;
    });
  } catch (err) { return []; }
}

async function findBookingByPhone(phone) {
  try {
    const result = await lookupByPhone(phone);
    if (!result.found) return { found: false };
    const booked = result.allRecords.find(r => r.booking_status === 'BOOKED');
    if (!booked) return { found: false };
    return { found: true, record: booked };
  } catch (err) { return { found: false }; }
}

module.exports = {
  saveLead, updateLead, updateLeadById, saveConversation, saveAnalytics,
  lookupByPhone, getLeadsNeedingReminder24h, getLeadsNeedingReminder1h,
  markReminderSent, getTodayStats, getLeadsNeedingReview,
  getLeadsNeedingFollowUp30, findBookingByPhone
};
