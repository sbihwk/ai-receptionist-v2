const axios = require('axios');
require('dotenv').config();

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  "Content-Type": "application/json"
};

const TABLES = {
  leads: "Leads",
  conversationHistory: "ConversationHistory",
  analytics: "ConversationAnalytics",
  businesses: "Businesses",
  reminders: "Reminders",
  billing: "BillingTickets"
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function airtableRequest(method, table, data = null, params = {}) {
  try {
    const config = { method, url: `${BASE_URL}/${encodeURIComponent(table)}`, headers: HEADERS, params };
    if (data) config.data = data;
    const response = await axios(config);
    await delay(200);
    return response.data;
  } catch (err) {
    console.error("[airtableService:airtableRequest]", err.message, err.response?.data);
    throw err;
  }
}

async function saveLead(data) {
  try {
    const fields = {
      customer_name: data.full_name || data.caller_name || "",
      phone: data.callback_phone || data.caller_phone || "",
      address: data.service_address || "",
      service_type: data.service_type || "",
      issue: data.issue_description || "",
      urgency: data.urgency_level || "flexible",
      booking_status: data.status || "BOOKED",
      businessId: data.businessId || "default",
      conversationId: data.conversationId || "",
      lead_score: data.lead_score || "",
      ReviewRequestSent: false,
      FollowUp30DaySent: false,
      Reminder24hSent: false,
      Reminder1hSent: false,
      timestamp: data.appointment_datetime || new Date().toISOString()
    };
    const result = await airtableRequest("post", TABLES.leads, { fields });
    console.log("[airtable] Lead saved successfully");
    return result;
  } catch (err) {
    console.error("[airtableService:saveLead]", err.message, err);
    throw err;
  }
}

async function updateLead(recordId, updates) {
  try {
    return await airtableRequest("patch", TABLES.leads, { fields: updates }, {});
  } catch (err) {
    console.error("[airtableService:updateLead]", err.message, err);
    throw err;
  }
}

async function updateLeadById(recordId, updates) {
  try {
    const config = { method: "patch", url: `${BASE_URL}/${encodeURIComponent(TABLES.leads)}/${recordId}`, headers: HEADERS, data: { fields: updates } };
    const response = await axios(config);
    await delay(200);
    return response.data;
  } catch (err) {
    console.error("[airtableService:updateLeadById]", err.message, err);
    throw err;
  }
}

async function saveConversation(callSid, transcript, summary) {
  try {
    const fields = {
      CallSid: callSid,
      Transcript: typeof transcript === "string" ? transcript : JSON.stringify(transcript),
      Summary: summary || ""
    };
    const result = await airtableRequest("post", TABLES.conversationHistory, { fields });
    console.log("[airtable] Conversation saved successfully");
    return result;
  } catch (err) {
    console.error("[airtableService:saveConversation]", err.message, err);
    throw err;
  }
}

async function saveAnalytics(data) {
  try {
    const fields = {
      CallSid: data.callSid || "",
      BookingMade: data.bookingMade || false,
      EmergencyDetected: data.emergencyDetected || false,
      revenue_opportunity: String(data.revenueOpportunity || "0"),
      detected_issue: data.serviceType || "",
      call_summary: data.callSummary || "",
      recommended_followup: data.recommendedFollowup || "",
      IssueCategory: data.callClassification || "",
      timestamp: new Date().toISOString()
    };
    const result = await airtableRequest("post", TABLES.analytics, { fields });
    console.log("[airtable] Analytics saved successfully");
    return result;
  } catch (err) {
    console.error("[airtableService:saveAnalytics]", err.message, err);
    throw err;
  }
}

async function lookupByPhone(phone) {
  try {
    const cleanPhone = phone.replace(/[^\d+]/g, "");
    const filterFormula = `OR({phone}="${cleanPhone}", {phone}="${phone}")`;
    const result = await airtableRequest("get", TABLES.leads, null, { filterByFormula: filterFormula, sort: [{ field: "timestamp", direction: "desc" }], maxRecords: 10 });
    if (!result.records || result.records.length === 0) return { found: false };
    const records = result.records;
    const latest = records[0].fields;
    const bookedRecords = records.filter(r => r.fields.booking_status === "BOOKED" || r.fields.booking_status === "COMPLETED");
    return { found: true, recordId: records[0].id, name: latest.customer_name || "", lastServiceDate: latest.timestamp || "", lastServiceType: latest.service_type || "", totalJobs: bookedRecords.length, lifetimeValue: bookedRecords.length * (parseInt(process.env.AVERAGE_TICKET_VALUE, 10) || 450), allRecords: records };
  } catch (err) {
    console.error("[airtableService:lookupByPhone]", err.message, err);
    return { found: false };
  }
}

async function getLeadsNeedingReminder24h() {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in26h = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const filterFormula = `AND({Reminder24hSent}=FALSE(),{booking_status}="BOOKED",{timestamp}!="",IS_AFTER({timestamp},"${in24h.toISOString()}"),IS_BEFORE({timestamp},"${in26h.toISOString()}"))`;
    const result = await airtableRequest("get", TABLES.leads, null, { filterByFormula: filterFormula, maxRecords: 50 });
    return result.records || [];
  } catch (err) { return []; }
}

async function getLeadsNeedingReminder1h() {
  try {
    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const in1_5h = new Date(now.getTime() + 90 * 60 * 1000);
    const filterFormula = `AND({Reminder1hSent}=FALSE(),{booking_status}="BOOKED",{timestamp}!="",IS_AFTER({timestamp},"${in1h.toISOString()}"),IS_BEFORE({timestamp},"${in1_5h.toISOString()}"))`;
    const result = await airtableRequest("get", TABLES.leads, null, { filterByFormula: filterFormula, maxRecords: 50 });
    return result.records || [];
  } catch (err) { return []; }
}

async function markReminderSent(recordId, type) {
  try {
    const updates = {};
    if (type === "24h") updates.Reminder24hSent = true;
    if (type === "1h") updates.Reminder1hSent = true;
    if (type === "review") updates.ReviewRequestSent = true;
    if (type === "followup30") updates.FollowUp30DaySent = true;
    return await updateLeadById(recordId, updates);
  } catch (err) { throw err; }
}

async function getTodayStats() {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const analyticsResult = await airtableRequest("get", TABLES.analytics, null, { filterByFormula: `IS_AFTER({timestamp},"${startOfDay}")`, maxRecords: 500 });
    const records = analyticsResult.records || [];
    return { totalCalls: records.length, bookingsMade: records.filter(r => r.fields.BookingMade).length, emergencies: records.filter(r => r.fields.EmergencyDetected).length, estimatedRevenue: records.filter(r => r.fields.BookingMade).length * (parseInt(process.env.AVERAGE_TICKET_VALUE, 10) || 450), date: today.toLocaleDateString("en-US", { timeZone: process.env.TIME_ZONE || "America/Chicago" }) };
  } catch (err) { return { totalCalls: 0, bookingsMade: 0, emergencies: 0, estimatedRevenue: 0, date: new Date().toLocaleDateString() }; }
}

async function getLeadsNeedingReview() {
  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const filterFormula = `AND({ReviewRequestSent}=FALSE(),{booking_status}="BOOKED",{timestamp}!="",IS_BEFORE({timestamp},"${fourHoursAgo.toISOString()}"))`;
    const result = await airtableRequest("get", TABLES.leads, null, { filterByFormula: filterFormula, maxRecords: 50 });
    return result.records || [];
  } catch (err) { return []; }
}

async function getLeadsNeedingFollowUp30() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const filterFormula = `AND({FollowUp30DaySent}=FALSE(),{booking_status}="BOOKED",{timestamp}!="",IS_BEFORE({timestamp},"${thirtyDaysAgo.toISOString()}"),IS_AFTER({timestamp},"${thirtyOneDaysAgo.toISOString()}"))`;
    const result = await airtableRequest("get", TABLES.leads, null, { filterByFormula: filterFormula, maxRecords: 50 });
    return result.records || [];
  } catch (err) { return []; }
}

async function findBookingByPhone(phone) {
  try {
    const cleanPhone = phone.replace(/[^\d+]/g, "");
    const filterFormula = `AND(OR({phone}="${cleanPhone}",{phone}="${phone}"),{booking_status}="BOOKED")`;
    const result = await airtableRequest("get", TABLES.leads, null, { filterByFormula: filterFormula, sort: [{ field: "timestamp", direction: "desc" }], maxRecords: 1 });
    if (result.records && result.records.length > 0) return { found: true, record: result.records[0] };
    return { found: false };
  } catch (err) { return { found: false }; }
}

module.exports = { saveLead, updateLead, updateLeadById, saveConversation, saveAnalytics, lookupByPhone, getLeadsNeedingReminder24h, getLeadsNeedingReminder1h, markReminderSent, getTodayStats, getLeadsNeedingReview, getLeadsNeedingFollowUp30, findBookingByPhone };
