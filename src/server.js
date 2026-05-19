require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const axios = require('axios');

const twilioHandler = require('./twilioHandler');
const { handleMediaStream } = require('./realtimeAI');
const callManager = require('./callManager');
const airtableService = require('./airtableService');
const smsService = require('./smsService');
const businessConfig = require('./businessConfig');
const { startReminderScheduler } = require('./reminderScheduler');
const { startFollowUpScheduler } = require('./followUpScheduler');

const app = express();

app.set('trust proxy', 1);

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({ windowMs: 60*1000, max: 30, message: 'Too many requests', validate: { xForwardedForHeader: false } });
app.use('/widget-chat', limiter);
app.use('/incoming-call', limiter);
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('widget'));

const PORT = process.env.PORT || 3000;

// Session store for widget chat history
const widgetSessions = new Map();

function extractPhone(text) {
  const patterns = [
    /\+?1?\s*\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/,
    /\d{3}[\s.\-]\d{3}[\s.\-]\d{4}/,
    /\(\d{3}\)\s*\d{3}[\s.\-]?\d{4}/,
    /\d{10}/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].replace(/[^\d+]/g, '');
  }
  return null;
}

function extractName(text) {
  const patterns = [
    /my name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /i(?:'m|\s+am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /this is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:name|call me)\s*(?:is)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+here/im
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// --- Routes ---

// Twilio incoming call webhook
app.post('/incoming-call', twilioHandler.handleIncomingCall);

// Twilio call status webhook
app.post('/call-status', twilioHandler.handleCallStatus);

// Inbound SMS handler
app.post('/sms-incoming', async (req, res) => {
  try {
    const { From, Body, MessageSid } = req.body;
    console.log(`[server] Inbound SMS â€” From: ${From}, Body: ${Body}`);

    // Save to Airtable
    try {
      await airtableService.saveConversation(MessageSid || `sms-${Date.now()}`, `Customer (${From}): ${Body}`, 'Inbound SMS');
    } catch (atErr) {
      console.error('[server:sms-incoming] Airtable save failed:', atErr.message);
    }

    // Handle CANCEL keyword
    if (Body && Body.trim().toUpperCase() === 'CANCEL') {
      const booking = await airtableService.findBookingByPhone(From);
      if (booking.found) {
        await airtableService.updateLeadById(booking.record.id, { Status: 'CANCELLED' });
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Your appointment has been cancelled. If you'd like to rebook, just call us at ${businessConfig.phone}.</Message></Response>`;
        res.set('Content-Type', 'text/xml');
        return res.send(twiml);
      }
    }

    // Default SMS reply
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks for reaching out to ${businessConfig.name}! For fastest service, call us at ${businessConfig.phone}. We'll get back to you shortly!</Message></Response>`;
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('[server:sms-incoming]', err.message, err);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks for your message! We'll get back to you shortly.</Message></Response>`);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeCalls: callManager.getActiveCallCount(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Dashboard data
app.get('/dashboard-data', async (req, res) => {
  try {
    const stats = await airtableService.getTodayStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('[server:dashboard-data]', err.message, err);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// Website chat widget endpoint
app.post('/widget-chat', async (req, res) => {
  try {
    const { message, sessionId, userName, userPhone } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build messages for OpenAI chat completions
    const systemPrompt = buildWidgetSystemPrompt();
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    // Call Groq chat completions
    const groqResponse = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = groqResponse.data.choices[0].message.content;
    const sid = sessionId || `widget-${Date.now()}`;

    // Accumulate conversation history for this session
    if (!widgetSessions.has(sid)) {
      widgetSessions.set(sid, { history: '', leadSaved: false });
    }
    const session = widgetSessions.get(sid);
    session.history += `\nCustomer: ${message}\nAlex: ${reply}`;

    // Save to Airtable
    try {
      await airtableService.saveConversation(
        sid,
        `Customer: ${message}\nAlex: ${reply}`,
        'Website chat widget'
      );
    } catch (atErr) {
      console.error('[server:widget-chat] Airtable save failed:', atErr.message);
    }

    // Determine name and phone â€” prefer explicit, then extract from message, then from session history
    let detectedName = userName || extractName(message) || extractName(session.history);
    let detectedPhone = userPhone || extractPhone(message) || extractPhone(session.history);

    // Save as lead if we have both name and phone (and haven't already saved for this session)
    if (detectedName && detectedPhone && !session.leadSaved) {
      try {
        await airtableService.saveLead({
          caller_name: detectedName,
          caller_phone: detectedPhone,
          issue_description: session.history.trim(),
          status: 'LEAD',
          intent: 'website_chat',
          channel: 'widget'
        });
        session.leadSaved = true;
        console.log(`[server:widget-chat] Auto-saved lead: ${detectedName} / ${detectedPhone}`);
      } catch (leadErr) {
        console.error('[server:widget-chat] Lead save failed:', leadErr.message);
      }
    }

    res.json({ reply, sessionId: sid });
  } catch (err) {
    console.error('[server:widget-chat]', err.message, err);
    res.status(500).json({
      reply: `Thanks for reaching out! For immediate assistance, please call us at ${businessConfig.phone}. We're happy to help!`,
      error: true
    });
  }
});

function buildWidgetSystemPrompt() {
  return `You are Alex, the friendly virtual assistant for ${businessConfig.name}. You're chatting with a website visitor.

Keep responses concise â€” 2-3 sentences max. Be warm, professional, and helpful.

BUSINESS INFO:
Name: ${businessConfig.name}
Phone: ${businessConfig.phone}
Hours: ${businessConfig.hours}
Service Areas: ${businessConfig.serviceAreas}
Services: HVAC, Plumbing, Electrical
Dispatch Fee: ${businessConfig.dispatchFee} (waived if repair done same visit)
Maintenance Plan: $199/year

YOUR GOALS:
1. Answer questions helpfully
2. Collect: name, phone, service needed, address, urgency
3. Encourage booking â€” mention you can schedule right away
4. For emergencies, tell them to call ${businessConfig.phone} immediately
5. Never quote exact repair prices â€” dispatch fee only
6. Never say you're an AI â€” say "I'm Alex, a virtual assistant for ${businessConfig.name}"

If they provide enough info to book (name, phone, address, service type):
"I've got your info! Our team will call you shortly to confirm your appointment. You can also call us directly at ${businessConfig.phone}."`;
}

// --- WebSocket Server for Twilio Media Streams ---

const wss = new WebSocketServer({ server, path: '/media-stream' });

wss.on('connection', (ws, req) => {
  console.log(`[server] New WebSocket connection on /media-stream`);
  handleMediaStream(ws, req);
});

wss.on('error', (err) => {
  console.error('[server:wss]', err.message, err);
});

// Debug endpoint for calendar credentials
app.get('/debug-calendar', async (req, res) => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return res.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not set' });
  try {
    const creds = JSON.parse(raw);
    res.json({ 
      type: creds.type,
      client_email: creds.client_email,
      has_private_key: !!creds.private_key,
      private_key_starts: creds.private_key?.substring(0, 40)
    });
  } catch(e) {
    res.json({ error: 'JSON parse failed: ' + e.message, raw_starts: raw.substring(0, 50) });
  }
});

// Test calendar booking endpoint
app.get('/test-calendar-booking', async (req, res) => {
  try {
    const calSvc = require('./calendarService');
    const event = await calSvc.createEvent({
      summary: 'Test AC Repair',
      description: 'Test booking from endpoint',
      startTime: new Date(Date.now() + 24*60*60*1000).toISOString(),
      endTime: new Date(Date.now() + 25*60*60*1000).toISOString()
    });
    return res.json({ success: true, eventId: event.id });
  } catch(err) {
    return res.json({ success: false, error: err.message });
  }
});

// --- Start Server ---

server.listen(PORT, () => {
  console.log(`\n====================================`);
  console.log(`  ${businessConfig.name} AI Receptionist`);
  console.log(`  Server running on port ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`====================================\n`);

  // Start schedulers
  try {
    startReminderScheduler();
    startFollowUpScheduler();
  } catch (schedErr) {
    console.error('[server] Scheduler startup error:', schedErr.message);
  }
});

// --- Graceful Shutdown ---

function gracefulShutdown(signal) {
  console.log(`\n[server] ${signal} received. Shutting down gracefully...`);

  // Close WebSocket connections
  wss.clients.forEach((client) => {
    client.close();
  });

  // Close HTTP server
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('[server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[server:uncaughtException]', err.message, err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[server:unhandledRejection]', reason);
});

module.exports = { app, server };





