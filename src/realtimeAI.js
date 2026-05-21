const WebSocket = require('ws');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const callManager = require('./callManager');
const businessConfig = require('./businessConfig');
const { handleCheckCalendar } = require('./tools/checkCalendar');
const { handleSaveBooking } = require('./tools/saveBooking');
const { handleFlagEmergency } = require('./tools/flagEmergency');
const { handleLookupCustomer } = require('./tools/lookupCustomer');
const { handleRescheduleBooking } = require('./tools/rescheduleBooking');
const { handleCancelBooking } = require('./tools/cancelBooking');
const { handleTransferToHuman } = require('./tools/transferToHuman');
const { handleSaveLeadIntent } = require('./tools/saveLeadIntent');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const TOOL_HANDLERS = {
  check_calendar: handleCheckCalendar,
  save_booking_data: handleSaveBooking,
  flag_emergency: handleFlagEmergency,
  lookup_customer: handleLookupCustomer,
  reschedule_booking: handleRescheduleBooking,
  cancel_booking: handleCancelBooking,
  transfer_to_human: handleTransferToHuman,
  save_lead_intent: handleSaveLeadIntent
};

// ============================================================
// AUDIO CONVERSION: Gemini sends 24kHz PCM, Twilio needs 8kHz mulaw
// ============================================================
function pcmToMulaw(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function convertAudioForTwilio(base64Audio) {
  try {
    const pcm24k = Buffer.from(base64Audio, 'base64');
    const samples24k = new Int16Array(pcm24k.buffer, pcm24k.byteOffset, pcm24k.length / 2);
    // Downsample 24kHz -> 8kHz (take every 3rd sample)
    const samples8k = new Int16Array(Math.floor(samples24k.length / 3));
    for (let i = 0; i < samples8k.length; i++) {
      samples8k[i] = samples24k[i * 3];
    }
    // Convert PCM16 to mulaw
    const mulaw = Buffer.alloc(samples8k.length);
    for (let i = 0; i < samples8k.length; i++) {
      mulaw[i] = pcmToMulaw(samples8k[i]);
    }
    return mulaw.toString('base64');
  } catch (err) {
    console.error('[realtimeAI:convertAudio]', err.message);
    return null;
  }
}

// ============================================================
// GEMINI TOOLS
// ============================================================
const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'check_calendar',
        description: 'Check calendar availability. Call this BEFORE offering any time slots.',
        parameters: {
          type: 'OBJECT',
          properties: {
            service_type: { type: 'STRING', enum: ['hvac', 'plumbing', 'electrical', 'general', 'other'] },
            urgency: { type: 'STRING', enum: ['emergency', 'today', 'this_week', 'flexible'] },
            duration_minutes: { type: 'NUMBER' }
          },
          required: ['service_type', 'urgency']
        }
      },
      {
        name: 'save_booking_data',
        description: 'Save completed booking after confirming all details with caller',
        parameters: {
          type: 'OBJECT',
          properties: {
            full_name: { type: 'STRING' },
            callback_phone: { type: 'STRING' },
            service_address: { type: 'STRING' },
            service_type: { type: 'STRING' },
            issue_description: { type: 'STRING' },
            urgency_level: { type: 'STRING' },
            confirmed_slot: { type: 'STRING' },
            appointment_datetime: { type: 'STRING' },
            call_notes: { type: 'STRING' }
          },
          required: ['full_name', 'callback_phone', 'service_type', 'confirmed_slot']
        }
      },
      {
        name: 'flag_emergency',
        description: 'Call IMMEDIATELY when emergency detected',
        parameters: {
          type: 'OBJECT',
          properties: {
            emergency_type: { type: 'STRING' },
            caller_address: { type: 'STRING' },
            caller_phone: { type: 'STRING' },
            description: { type: 'STRING' },
            safety_status: { type: 'STRING', enum: ['safe', 'unsafe', 'unknown'] }
          },
          required: ['emergency_type', 'safety_status']
        }
      },
      {
        name: 'lookup_customer',
        description: 'Look up returning customer by phone number',
        parameters: {
          type: 'OBJECT',
          properties: { phone_number: { type: 'STRING' } },
          required: ['phone_number']
        }
      },
      {
        name: 'reschedule_booking',
        description: 'Reschedule an existing appointment',
        parameters: {
          type: 'OBJECT',
          properties: {
            caller_phone: { type: 'STRING' },
            new_slot: { type: 'STRING' },
            reason: { type: 'STRING' }
          },
          required: ['caller_phone', 'new_slot']
        }
      },
      {
        name: 'cancel_booking',
        description: 'Cancel an existing appointment',
        parameters: {
          type: 'OBJECT',
          properties: {
            caller_phone: { type: 'STRING' },
            reason: { type: 'STRING' }
          },
          required: ['caller_phone']
        }
      },
      {
        name: 'transfer_to_human',
        description: 'Transfer call to a human when requested',
        parameters: {
          type: 'OBJECT',
          properties: {
            reason: { type: 'STRING' },
            caller_name: { type: 'STRING' },
            caller_phone: { type: 'STRING' },
            summary: { type: 'STRING' }
          },
          required: ['reason']
        }
      },
      {
        name: 'save_lead_intent',
        description: 'Save caller info when interested but not ready to book',
        parameters: {
          type: 'OBJECT',
          properties: {
            full_name: { type: 'STRING' },
            phone: { type: 'STRING' },
            interest: { type: 'STRING' }
          },
          required: ['phone', 'interest']
        }
      }
    ]
  }
];

// ============================================================
// SYSTEM PROMPT
// ============================================================
function buildSystemPrompt() {
  return `You are Alex, a friendly and professional AI receptionist for ${businessConfig.name}.

BUSINESS: ${businessConfig.name}
PHONE: ${businessConfig.phone}
HOURS: ${businessConfig.hours}
SERVICE AREAS: ${businessConfig.serviceAreas}

YOUR JOB:
- Answer calls warmly and professionally
- Help callers book service appointments
- Collect: name, phone, address, service needed, urgency
- Always call check_calendar BEFORE offering time slots
- Confirm booking details verbally then call save_booking_data
- For emergencies (gas leak, flooding, no power) call flag_emergency immediately

RULES:
- Keep responses SHORT - this is a phone call
- Never make up available slots - always check calendar first
- Never say you are an AI or robot
- Be warm, helpful, and efficient like a great human receptionist

Start by greeting the caller warmly. IMPORTANT: Never show your thinking process or internal notes. Speak directly and naturally.`;
}

// ============================================================
// MAIN HANDLER
// ============================================================
function handleMediaStream(ws, req) {
  console.log('[realtimeAI] New media stream connection');

  let streamSid = null;
  let callSid = null;
  let callerPhone = null;
  let geminiWs = null;
  let audioBuffer = [];
  let isGeminiReady = false;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid || msg.start.customParameters?.callSid;
        callerPhone = msg.start.customParameters?.callerPhone || msg.start.from || 'unknown';
        console.log(`[realtimeAI] Stream started — SID: ${streamSid}, Call: ${callSid}, From: ${callerPhone}`);
        callManager.initCall(callSid, { streamSid, callerPhone, startTime: new Date().toISOString() });
        connectToGemini();
      }

      if (msg.event === 'media' && geminiWs) {
        if (isGeminiReady && geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify({
            realtime_input: {
              media_chunks: [{ mime_type: 'audio/pcm;rate=8000', data: msg.media.payload }]
            }
          }));
        } else {
          audioBuffer.push(msg.media.payload);
        }
      }

      if (msg.event === 'stop') {
        console.log(`[realtimeAI] Stream stopped — SID: ${streamSid}`);
        cleanup();
      }
    } catch (err) {
      console.error('[realtimeAI:twilioMessage]', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[realtimeAI] Twilio WebSocket closed — Call: ${callSid}`);
    cleanup();
  });

  ws.on('error', (err) => console.error('[realtimeAI:twilioWsError]', err.message));

  function connectToGemini() {
    console.log(`[realtimeAI] Connecting to Gemini Live — Call: ${callSid}`);
    geminiWs = new WebSocket(GEMINI_WS_URL);

    geminiWs.on('open', () => {
      console.log(`[realtimeAI] Gemini WebSocket open — Call: ${callSid}`);
      geminiWs.send(JSON.stringify({
        setup: {
          model: `models/${GEMINI_MODEL}`,
          generation_config: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: process.env.AGENT_VOICE || 'Aoede' }
              }
            }
          },
          system_instruction: {
            parts: [{ text: buildSystemPrompt() }]
          },
          tools: GEMINI_TOOLS
        }
      }));
      console.log(`[realtimeAI] Gemini setup message sent — Call: ${callSid}`);
    });

    geminiWs.on('message', async (data) => {
      try {
        const event = JSON.parse(data.toString());

        if (event.setupComplete !== undefined) {
          console.log(`[realtimeAI] Gemini setup complete — Call: ${callSid}`);
          isGeminiReady = true;

          // Flush buffered audio
          for (const chunk of audioBuffer) {
            if (geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify({
                realtime_input: {
                  media_chunks: [{ mime_type: 'audio/pcm;rate=8000', data: chunk }]
                }
              }));
            }
          }
          audioBuffer = [];

          // Send greeting
          geminiWs.send(JSON.stringify({
            client_content: {
              turns: [{ role: 'user', parts: [{ text: `[Call started. Greet the caller warmly as the receptionist for ${businessConfig.name}. Keep it short and natural.]` }] }],
              turn_complete: true
            }
          }));
        }

        // Audio response — convert and send to Twilio
        if (event.serverContent?.modelTurn?.parts) {
          for (const part of event.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.includes('audio') && ws.readyState === WebSocket.OPEN) {
              const converted = convertAudioForTwilio(part.inlineData.data);
              if (converted) {
                ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: converted } }));
              }
            }
          }
        }

        // Tool call
        if (event.toolCall) {
          for (const fc of event.toolCall.functionCalls || []) {
            await executeTool(fc);
          }
        }

        if (event.error) {
          console.error(`[realtimeAI:geminiError] Call: ${callSid}`, JSON.stringify(event.error));
        }

      } catch (err) {
        console.error('[realtimeAI:geminiMessage]', err.message);
      }
    });

    geminiWs.on('close', (code, reason) => {
      console.log(`[realtimeAI] Gemini closed — code: ${code}, reason: ${reason?.toString()} — Call: ${callSid}`);      if (code === 1011 || code === 1012 || code === 1013) {
        console.log('[realtimeAI] Gemini unavailable, reconnecting in 2s...');
        setTimeout(() => { if (ws.readyState === WebSocket.OPEN) connectToGemini(); }, 2000);
      }
    });
    geminiWs.on('error', (err) => console.error('[realtimeAI:geminiWsError]', err.message));
  }

  async function executeTool(fc) {
    const toolName = fc.name;
    const callId = fc.id;
    let args = {};
    try {
      args = typeof fc.args === 'string' ? JSON.parse(fc.args) : (fc.args || {});
    } catch (e) { args = fc.args || {}; }

    console.log(`[realtimeAI] Tool call: ${toolName} — Call: ${callSid}`);
    let result = { success: false, message: 'Tool not found' };

    try {
      const handler = TOOL_HANDLERS[toolName];
      if (handler) result = await handler(args, callSid, callerPhone);
    } catch (err) {
      console.error(`[realtimeAI:tool:${toolName}]`, err.message);
      result = { success: false, error: err.message };
    }

    try {
      if (toolName === 'save_booking_data') {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        callManager.updateCall(callSid, { bookingMade: parsed.success || false, serviceType: args.service_type });
      } else if (toolName === 'flag_emergency') {
        callManager.updateCall(callSid, { emergencyDetected: true });
      }
    } catch (_) {}

    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(JSON.stringify({
        tool_response: {
          function_responses: [{ id: callId, name: toolName, response: { output: result } }]
        }
      }));
    }
  }

  function cleanup() {
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
    if (callSid) callManager.endCall(callSid);
  }
}

module.exports = { handleMediaStream };


