const WebSocket = require('ws');
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';

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

const TOOLS = [
  {
    type: 'function',
    name: 'check_calendar',
    description: 'Check real Google Calendar availability for the correct technician based on service type. Call this BEFORE offering any time slots to the caller.',
    parameters: {
      type: 'object',
      properties: {
        service_type: { type: 'string', enum: ['hvac', 'plumbing', 'electrical', 'general'] },
        urgency: { type: 'string', enum: ['emergency', 'today', 'this_week', 'flexible'] },
        duration_minutes: { type: 'number', description: 'Estimated job duration, default 120' }
      },
      required: ['service_type', 'urgency']
    }
  },
  {
    type: 'function',
    name: 'save_booking_data',
    description: 'Save completed booking after verbally confirming all details with caller',
    parameters: {
      type: 'object',
      properties: {
        full_name: { type: 'string' },
        callback_phone: { type: 'string' },
        service_address: { type: 'string' },
        service_type: { type: 'string', enum: ['hvac', 'plumbing', 'electrical', 'other'] },
        issue_description: { type: 'string' },
        urgency_level: { type: 'string', enum: ['emergency', 'today', 'this_week', 'flexible'] },
        confirmed_slot: { type: 'string', description: 'The exact slot the caller confirmed' },
        appointment_datetime: { type: 'string', description: 'ISO 8601 datetime if known' },
        upsell_mentioned: { type: 'boolean' },
        upsell_interested: { type: 'boolean' },
        customer_mood: { type: 'string', enum: ['happy', 'neutral', 'frustrated', 'angry'] },
        how_they_found_us: { type: 'string' },
        call_notes: { type: 'string' }
      },
      required: ['full_name', 'callback_phone', 'service_address', 'service_type', 'issue_description', 'urgency_level', 'confirmed_slot']
    }
  },
  {
    type: 'function',
    name: 'flag_emergency',
    description: 'Call IMMEDIATELY when emergency detected. Do not wait to collect full info.',
    parameters: {
      type: 'object',
      properties: {
        emergency_type: { type: 'string', enum: ['gas_leak', 'flooding', 'burst_pipe', 'no_heat_winter', 'sewage_backup', 'carbon_monoxide', 'electrical_fire', 'no_power', 'other'] },
        caller_address: { type: 'string' },
        caller_phone: { type: 'string' },
        description: { type: 'string' },
        safety_status: { type: 'string', enum: ['safe', 'unsafe', 'unknown'] }
      },
      required: ['emergency_type', 'safety_status']
    }
  },
  {
    type: 'function',
    name: 'lookup_customer',
    description: 'Look up returning customer history by phone number',
    parameters: {
      type: 'object',
      properties: {
        phone_number: { type: 'string' }
      },
      required: ['phone_number']
    }
  },
  {
    type: 'function',
    name: 'reschedule_booking',
    description: 'Reschedule an existing appointment',
    parameters: {
      type: 'object',
      properties: {
        caller_phone: { type: 'string' },
        new_preferred_slot: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['caller_phone', 'new_preferred_slot']
    }
  },
  {
    type: 'function',
    name: 'cancel_booking',
    description: 'Cancel an existing appointment',
    parameters: {
      type: 'object',
      properties: {
        caller_phone: { type: 'string' },
        reason: { type: 'string' },
        offer_reschedule: { type: 'boolean' }
      },
      required: ['caller_phone']
    }
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: 'Transfer call to live person when caller insists or situation requires it',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        urgency: { type: 'string', enum: ['immediate', 'when_available'] },
        notes: { type: 'string' }
      },
      required: ['reason']
    }
  },
  {
    type: 'function',
    name: 'save_lead_intent',
    description: 'Save caller info even if they don\'t book — price inquiries, complaints, hesitant callers',
    parameters: {
      type: 'object',
      properties: {
        caller_phone: { type: 'string' },
        caller_name: { type: 'string' },
        intent: { type: 'string', enum: ['price_inquiry', 'complaint', 'just_browsing', 'follow_up_needed', 'not_ready'] },
        service_interest: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['caller_phone', 'intent']
    }
  }
];

function buildSystemPrompt() {
  return `You are Alex, the professional receptionist for ${businessConfig.name}. You handle every call with warmth, confidence, and efficiency — like the best human receptionist in the world. You speak naturally with contractions and normal conversational flow. Never sound robotic or scripted.

PERSONALITY:
- Warm and professional — like a friendly hotel concierge
- Calm under pressure — never flustered even with angry callers
- Empathetic first, solution second with frustrated callers
- Confident about pricing and policies — never apologetic
- Concise — 2-3 sentences max per response, let caller talk
- Never say you are an AI — say "I'm Alex, a virtual assistant for ${businessConfig.name}"

BUSINESS HOURS:
- We are open Monday-Friday 7am-7pm and Saturday 8am-4pm (America/Phoenix time)
- If a customer calls outside business hours, acknowledge it warmly and still collect their info
- Say something like "We're currently closed but I've got you covered - let me take your details and our team will confirm your appointment first thing when we open"
- For EMERGENCIES (no heat in winter, flooding, gas smell) - always help regardless of hours and flag as emergency
- Never refuse to help - just set expectations about when the team will follow up

BUSINESS DETAILS:
Name: ${businessConfig.name}
Phone: ${businessConfig.phone}
Hours: ${businessConfig.hours}
Service Areas: ${businessConfig.serviceAreas}
Services: HVAC (installation, repair, maintenance, tune-up, filter replacement), Plumbing (leaks, drains, water heaters, toilets, pipes), Electrical (panels, outlets, lighting, ceiling fans, safety inspections)
Dispatch Fee: ${businessConfig.dispatchFee} — waived if repair is completed same visit
Emergency: 24/7 on-call technician
Maintenance Plan: $199/year — includes 2 seasonal tune-ups, priority scheduling, 10% parts discount

RETURNING CUSTOMER PROTOCOL:
If returningCustomer=true, use their name immediately. Reference history naturally:
"I see we last helped you with [service] — is this a similar issue or something new?"
This creates instant trust and shows professionalism.

CALL CLASSIFICATION — identify within first 30 seconds:
- EMERGENCY → immediate different protocol
- NEW_BOOKING → collect info and book
- RESCHEDULE → find new slot
- CANCELLATION → confirm cancel, offer reschedule
- PRICE_INQUIRY → sales language, never quote exact price
- COMPLAINT → empathy, escalate
- FAQ → answer from business knowledge
- FOLLOW_UP → returning customer question

EMERGENCY DETECTION — call flag_emergency tool IMMEDIATELY if you hear:
Gas smell / gas leak / I smell gas
No heat (in winter) / furnace not working / pipes freezing
Flooding / water everywhere / burst pipe
Sewage backup / sewage smell indoors
Carbon monoxide / CO alarm / headache from furnace
Sparks / electrical fire / burning smell from outlet
No power / complete electrical failure
Structural water damage

EMERGENCY RESPONSE PROTOCOL:
1. Interrupt anything else: "I'm flagging this as an emergency right now."
2. Ask: "First — are you and your family safe?"
3. Give immediate safety instruction:
   - Gas: "Leave the house immediately, don't touch any switches, call 911 if unsafe"
   - Flooding: "Turn off the main water valve — usually near the water meter"
   - Electrical fire: "Flip the main breaker if safe to do so, call 911 if flames"
   - CO: "Get everyone outside immediately, call 911"
4. "I'm alerting our on-call technician right now. What's your address?"
5. Call flag_emergency tool with all details
6. "Our technician will call you within 15 minutes. Please stay safe."

BOOKING FLOW — collect naturally, not like a form:
Step 1 — Understand the issue: "What's going on with it?" / "Tell me a bit more about what's happening"
Step 2 — Address: "And what's the address we'd be coming to?"
Step 3 — Name: "What's the best name for the appointment?"
Step 4 — Phone: "And the best number to reach you — is this the one you're calling from?"
Step 5 — Urgency: "How urgent is this for you — does it need attention today, or are you flexible on timing?"
Step 6 — Check real calendar: Call check_calendar tool with service_type and urgency
Step 7 — Offer real slots: "I'm showing availability [slot 1] or [slot 2] — which works better?"
Step 8 — Upsell (ONCE, naturally): "By the way — since we'll be out there anyway, worth mentioning our annual maintenance plan is $199 and covers two tune-ups plus priority scheduling. Most customers find it pays for itself. No pressure at all."
Step 9 — Confirm back: "Perfect — let me read that back. [Name], we have a [service_type] tech at [address] on [slot]. You'll get a text confirmation at [phone]. Does everything sound right?"
Step 10 — Call save_booking_data tool
Step 11 — "You're all set! You'll get a text in just a moment."

PRICE INQUIRY — SALES LANGUAGE:
Never: "I don't know" / exact prices / "it depends"
Always:
"Our dispatch fee is ${businessConfig.dispatchFee} and that's waived when we do the repair — so most customers effectively pay nothing for the visit itself."
"I can't quote exact repair costs over the phone because every job is different, but our technicians walk you through pricing before touching anything. No surprise bills."
"What I can tell you is we're competitively priced and our techs are upfront about everything."

For hesitant callers — closing language:
"Most of our customers are surprised by how reasonable it is once the tech sees it. The dispatch fee is the only guaranteed cost."
"Would you like me to pencil you in? You can always cancel if you change your mind — no charge."
"We're available [slot] — shall I hold that spot for you?"

COMPLAINT HANDLING:
Never argue. Never make excuses.
"I'm really sorry to hear that — that's not the experience we want you to have at all."
"I'm going to flag this directly for our manager and have them call you back within the hour. Can I confirm the best number?"
Call save_lead_intent tool with complaint intent.

ANGRY CUSTOMER HANDLING:
If a customer becomes angry, threatens legal action, or uses aggressive language:
- Never hang up on them
- Stay calm and empathetic
- Say: "I completely understand your frustration. Let me make sure we get this resolved for you right away."
- Offer to escalate to a human manager
- Never end the call due to customer anger
- Only end call if customer says goodbye

AFTER HOURS:
"Our office is closed right now but I can absolutely take your booking — our team will confirm first thing in the morning."
"For emergencies, we do have a 24/7 on-call technician available right now."

TRANSFER TO HUMAN:
If caller insists: "Of course — one moment please."
Call transfer_to_human tool.
"I'm connecting you now. Thank you for your patience."

THINGS YOU MUST NEVER SAY:
- Exact repair prices
- "I guarantee we can fix it today"
- "The tech will definitely arrive at [exact time]" — always say window
- "I don't know" — say "let me note that for our team"
- "That's not our problem"
- "I'm an AI" or "I'm a robot" or "I'm a language model"
- Anything that could be a legal liability

CALL ENDING RULES:
ONLY end the call when:
- Customer says "goodbye", "bye", "thanks", "thank you", or similar farewell
- Customer explicitly says "that's all I need" or "I'm done"
- Customer hangs up first

NEVER end the call due to:
- Tool errors or API failures
- Google Calendar failures
- Silence under 30 seconds
- Technical difficulties
- Angry customers (always stay on the line)

ENDING EVERY CALL:
"Thanks so much for calling ${businessConfig.name} — have a wonderful day!"`;
}

function handleMediaStream(twilioWs, req) {
  let streamSid = null;
  let callSid = null;
  let callerPhone = null;
  let returningCustomer = false;
  let customerName = '';
  let jobCount = 0;
  let openAiWs = null;
  let audioBufferQueue = [];
  let isResponseActive = false;
  let greetingSent = false;

  console.log('[realtimeAI] New media stream connection');

  twilioWs.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case 'start':
          streamSid = data.start.streamSid;
          callSid = data.start.customParameters?.callSid || '';
          callerPhone = data.start.customParameters?.from || '';
          returningCustomer = data.start.customParameters?.returningCustomer === 'true';
          customerName = data.start.customParameters?.customerName || '';
          jobCount = parseInt(data.start.customParameters?.jobCount || '0', 10);

          console.log(`[realtimeAI] Stream started — SID: ${streamSid}, Call: ${callSid}, From: ${callerPhone}`);

          callManager.updateCall(callSid, { streamSid });

          connectToOpenAI();
          break;

        case 'media':
          if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: data.media.payload
            }));
          } else {
            audioBufferQueue.push(data.media.payload);
          }
          break;

        case 'stop':
          console.log(`[realtimeAI] Stream stopped — SID: ${streamSid}`);
          if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.close();
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[realtimeAI:twilioMessage]', err.message, err);
    }
  });

  twilioWs.on('close', () => {
    console.log(`[realtimeAI] Twilio WebSocket closed — Call: ${callSid}`);
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
  });

  twilioWs.on('error', (err) => {
    console.error('[realtimeAI:twilioWsError]', err.message, err);
  });

  function connectToOpenAI() {
    openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openAiWs.on('open', () => {
      console.log(`[realtimeAI] Connected to OpenAI Realtime — Call: ${callSid}`);

      // Send session config
      const sessionUpdate = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          voice: 'shimmer',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            silence_duration_ms: 800,
            prefix_padding_ms: 300
          },
          instructions: buildSystemPrompt(),
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.7
        }
      };

      openAiWs.send(JSON.stringify(sessionUpdate));

      // Flush any queued audio
      while (audioBufferQueue.length > 0) {
        const audio = audioBufferQueue.shift();
        openAiWs.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio
        }));
      }
    });

    openAiWs.on('message', (rawMessage) => {
      try {
        const event = JSON.parse(rawMessage.toString());
        handleOpenAIEvent(event);
      } catch (err) {
        console.error('[realtimeAI:openAiMessage]', err.message, err);
      }
    });

    openAiWs.on('close', () => {
      console.log(`[realtimeAI] OpenAI WebSocket closed — Call: ${callSid}`);
    });

    openAiWs.on('error', (err) => {
      console.error('[realtimeAI:openAiWsError]', err.message, err);
    });
  }

  function handleOpenAIEvent(event) {
    switch (event.type) {
      case 'session.created':
        console.log(`[realtimeAI] Session created — Call: ${callSid}`);
        break;

      case 'session.updated':
        console.log(`[realtimeAI] Session updated — Call: ${callSid}`);
        
        // Single greeting with 1000ms delay and guard
        setTimeout(() => {
          if (!greetingSent && openAiWs.readyState === WebSocket.OPEN) {
            greetingSent = true;
            openAiWs.send(JSON.stringify({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions: "Say immediately: Thank you for calling Premier HVAC and Plumbing, this is Alex your 24/7 scheduling assistant. How can I help you today?"
              }
            }));
            console.log('[realtimeAI] Greeting sent');
          }
        }, 1000);
        break;

      case 'response.audio.delta':
        if (event.delta && twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: {
              payload: event.delta
            }
          }));
        }
        break;

      case 'response.audio_transcript.done':
        if (event.transcript) {
          callManager.addTranscriptEntry(callSid, 'assistant', event.transcript);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          callManager.addTranscriptEntry(callSid, 'user', event.transcript);
        }
        break;

      case 'input_audio_buffer.speech_started':
        handleInterruption();
        break;

      case 'response.output_item.done':
        if (event.item && event.item.type === 'function_call') {
          handleToolCall(event.item);
        }
        break;

      case 'response.created':
        isResponseActive = true;
        break;
        
      case 'response.done':
        isResponseActive = false;
        break;

      case 'error':
        console.error('[realtimeAI:openAiError]', JSON.stringify(event.error));
        break;

      default:
        break;
    }
  }


  function handleInterruption() {
    // Cancel current response only if one is active
    if (isResponseActive && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
      isResponseActive = false;
    }

    // Clear Twilio audio buffer
    if (twilioWs.readyState === WebSocket.OPEN && streamSid) {
      twilioWs.send(JSON.stringify({
        event: 'clear',
        streamSid
      }));
    }
  }

  async function handleToolCall(item) {
    const toolName = item.name;
    const callId = item.call_id;

    let args = {};
    try {
      args = JSON.parse(item.arguments || '{}');
    } catch (parseErr) {
      console.error('[realtimeAI:parseToolArgs]', parseErr.message);
    }

    // Inject caller phone if not provided
    if (!args.caller_phone && callerPhone) {
      args.caller_phone = callerPhone;
    }
    if (!args.callback_phone && callerPhone) {
      args.callback_phone = callerPhone;
    }
    if (!args.phone_number && callerPhone) {
      args.phone_number = callerPhone;
    }

    console.log(`[realtimeAI] Tool call: ${toolName} — Args: ${JSON.stringify(args)}`);

    let result;
    try {
      const handler = TOOL_HANDLERS[toolName];
      // Say filler while processing to avoid silence
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        let filler = "Sure, one moment...";
        if (toolName === "check_calendar") filler = "Let me check our availability for you, one moment...";
        if (toolName === "save_booking_data") filler = "Perfect, let me get that booked for you right now...";
        if (toolName === "lookup_customer") filler = "Let me pull up your information...";
        if (toolName === "flag_emergency") filler = "I am flagging this as an emergency right now...";
        openAiWs.send(JSON.stringify({ type: "response.create", response: { modalities: ["audio", "text"], instructions: `Say exactly: "${filler}"` } }));
        await new Promise(r => setTimeout(r, 800));
      }
      if (!handler) {
        result = JSON.stringify({ error: true, message: `Unknown tool: ${toolName}` });
      } else if (toolName === "transfer_to_human") {
        result = await handler(args, callSid);
      } else {
        result = await handler(args);
      }
    } catch (toolErr) {
      console.error(`[realtimeAI:toolExecution:${toolName}]`, toolErr.message, toolErr);
      result = JSON.stringify({ error: true, message: 'Tool execution failed. Please continue the conversation naturally.' });
    }

    // Update call state based on tool
    if (toolName === 'save_booking_data') {
      const parsed = JSON.parse(result);
      callManager.updateCall(callSid, {
        bookingMade: parsed.success || false,
        bookingId: parsed.bookingId || null,
        calendarEventId: parsed.calendarEventId || null,
        serviceType: args.service_type
      });
    } else if (toolName === 'flag_emergency') {
      callManager.updateCall(callSid, {
        emergencyDetected: true,
        serviceType: args.emergency_type
      });
    }

    // Send tool result back to OpenAI
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: result
        }
      }));

      // Continue the conversation
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        openAiWs.send(JSON.stringify({
          type: 'response.create'
        }));
      }
    }
  }
}

module.exports = { handleMediaStream };

