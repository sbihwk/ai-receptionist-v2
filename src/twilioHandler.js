require('dotenv').config();
const callManager = require('./callManager');
const airtableService = require('./airtableService');
const emailService = require('./emailService');
const businessConfig = require('./businessConfig');

function validateTwilioSignature(req, res, next) {
  const twilio = require('twilio');
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers['x-twilio-signature'] || '';
  const url = process.env.SERVER_URL + '/incoming-call';
  const valid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!valid) {
    console.warn('[twilioHandler] Invalid Twilio signature - rejected');
    return res.status(403).send('Forbidden');
  }
  next();
}

async function handleIncomingCall(req, res) {
  try {
    const { CallSid, From, To } = req.body;
    console.log(`[twilioHandler] Incoming call — SID: ${CallSid}, From: ${From}, To: ${To}, Time: ${new Date().toISOString()}`);

    // Look up returning customer
    let returningCustomer = false;
    let customerName = '';
    let jobCount = 0;

    try {
      const lookup = await airtableService.lookupByPhone(From);
      if (lookup.found) {
        returningCustomer = true;
        customerName = lookup.name;
        jobCount = lookup.totalJobs;
        console.log(`[twilioHandler] Returning customer: ${customerName} (${jobCount} jobs)`);
      }
    } catch (lookupErr) {
      console.error('[twilioHandler:lookupCustomer]', lookupErr.message);
    }

    // Initialize call state
    callManager.initCall(CallSid, {
      from: From,
      to: To,
      returningCustomer,
      customerName,
      jobCount
    });

    // Build WebSocket URL — CRITICAL: use wss:// not wsss://
    const wsUrl = (process.env.SERVER_URL || 'https://localhost:3000')
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
    const streamUrl = `${wsUrl}/media-stream`;

    // Return TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi">Thank you for calling. Please hold for just a moment.</Say><Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callSid" value="${CallSid}" />
      <Parameter name="from" value="${From}" />
      <Parameter name="to" value="${To}" />
      <Parameter name="returningCustomer" value="${returningCustomer}" />
      <Parameter name="customerName" value="${customerName}" />
      <Parameter name="jobCount" value="${jobCount}" />
    </Stream>
  </Connect>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('[twilioHandler:handleIncomingCall]', err.message, err);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, we're experiencing technical difficulties. Please call back in a few minutes.</Say>
</Response>`);
  }
}

async function handleCallStatus(req, res) {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;
    console.log(`[twilioHandler] Call status — SID: ${CallSid}, Status: ${CallStatus}, Duration: ${CallDuration}s`);

    if (CallStatus === 'completed') {
      await handleCallCompleted(CallSid, parseInt(CallDuration || '0', 10));
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[twilioHandler:handleCallStatus]', err.message, err);
    res.sendStatus(200);
  }
}

async function handleCallCompleted(callSid, duration) {
  try {
    const call = callManager.endCall(callSid);
    if (!call) {
      console.log(`[twilioHandler:handleCallCompleted] No call state found for ${callSid}`);
      return;
    }

    const transcriptText = callManager.getTranscriptText(callSid);

    // 1. Save conversation transcript to Airtable
    try {
      const summary = generateCallSummary(call);
      await airtableService.saveConversation(callSid, transcriptText, summary);
      console.log(`[twilioHandler] Conversation saved for ${callSid}`);
    } catch (convErr) {
      console.error('[twilioHandler:saveConversation]', convErr.message);
    }

    // 2. Save analytics
    try {
      await airtableService.saveAnalytics({
        callSid,
        duration,
        callClassification: call.callClassification || detectClassification(call),
        serviceType: call.serviceType || '',
        bookingMade: call.bookingMade,
        emergencyDetected: call.emergencyDetected,
        transferRequested: call.transferRequested,
        customerMood: call.customerMood || 'neutral',
        upsellMentioned: call.upsellMentioned,
        upsellInterested: call.upsellInterested,
        callerPhone: call.from,
        returningCustomer: call.returningCustomer,
        channel: 'voice'
      });
      console.log(`[twilioHandler] Analytics saved for ${callSid}`);
    } catch (analErr) {
      console.error('[twilioHandler:saveAnalytics]', analErr.message);
    }

    // Clean up call state
    callManager.removeCall(callSid);
    console.log(`[twilioHandler] Call ${callSid} fully processed and cleaned up`);
  } catch (err) {
    console.error('[twilioHandler:handleCallCompleted]', err.message, err);
  }
}

function generateCallSummary(call) {
  const parts = [];
  parts.push(`Call from ${call.from} at ${call.startTime}`);
  if (call.returningCustomer) parts.push(`Returning customer: ${call.customerName}`);
  if (call.bookingMade) parts.push(`Booking made: ${call.bookingId}`);
  if (call.emergencyDetected) parts.push('EMERGENCY DETECTED');
  if (call.transferRequested) parts.push('Transfer to human requested');
  if (call.serviceType) parts.push(`Service: ${call.serviceType}`);
  parts.push(`Mood: ${call.customerMood || 'neutral'}`);
  return parts.join(' | ');
}

function detectClassification(call) {
  if (call.emergencyDetected) return 'EMERGENCY';
  if (call.bookingMade) return 'NEW_BOOKING';
  if (call.transferRequested) return 'TRANSFER';
  return 'OTHER';
}

module.exports = {
  handleIncomingCall,
  handleCallStatus,
    validateTwilioSignature
};



