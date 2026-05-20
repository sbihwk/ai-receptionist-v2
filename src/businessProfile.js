require('dotenv').config();

// ============================================================
// BUSINESS PROFILE — controls everything per client
// Just change env vars, no code changes needed
// ============================================================

const BUSINESS_TYPE = (process.env.BUSINESS_TYPE || 'general').toLowerCase();
const AGENT_NAME = process.env.AGENT_NAME || 'Alex';
const LANGUAGE = (process.env.LANGUAGE || 'english').toLowerCase(); // english or hinglish

// ============================================================
// SERVICE TYPES per business — maps to calendar + technician
// ============================================================
const SERVICE_CONFIGS = {
  clinic: {
    services: (process.env.SERVICES || 'general consultation,follow-up,vaccination,blood test,health checkup').split(',').map(s => s.trim()),
    serviceLabel: 'appointment',
    staffLabel: 'doctor',
    urgencyTriggers: ['chest pain', 'breathing', 'accident', 'emergency', 'unconscious', 'bleeding'],
    bookingFields: ['full_name', 'callback_phone', 'service_type', 'issue_description', 'urgency_level', 'confirmed_slot'],
    defaultDuration: 30,
    askAddress: false,
  },
  salon: {
    services: (process.env.SERVICES || 'haircut,hair color,facial,manicure,pedicure,waxing,bridal makeup').split(',').map(s => s.trim()),
    serviceLabel: 'appointment',
    staffLabel: 'stylist',
    urgencyTriggers: [],
    bookingFields: ['full_name', 'callback_phone', 'service_type', 'confirmed_slot'],
    defaultDuration: 60,
    askAddress: false,
  },
  lawyer: {
    services: (process.env.SERVICES || 'consultation,property dispute,divorce,criminal defense,business law,documentation').split(',').map(s => s.trim()),
    serviceLabel: 'consultation',
    staffLabel: 'advocate',
    urgencyTriggers: ['arrested', 'court tomorrow', 'urgent', 'police'],
    bookingFields: ['full_name', 'callback_phone', 'service_type', 'issue_description', 'confirmed_slot'],
    defaultDuration: 45,
    askAddress: false,
  },
  ca: {
    services: (process.env.SERVICES || 'ITR filing,GST registration,GST filing,company registration,audit,TDS filing,business consultation').split(',').map(s => s.trim()),
    serviceLabel: 'appointment',
    staffLabel: 'CA',
    urgencyTriggers: ['notice', 'deadline', 'penalty', 'raid'],
    bookingFields: ['full_name', 'callback_phone', 'service_type', 'issue_description', 'confirmed_slot'],
    defaultDuration: 45,
    askAddress: false,
  },
  gym: {
    services: (process.env.SERVICES || 'gym membership,personal training,yoga,zumba,diet consultation,trial session').split(',').map(s => s.trim()),
    serviceLabel: 'session',
    staffLabel: 'trainer',
    urgencyTriggers: [],
    bookingFields: ['full_name', 'callback_phone', 'service_type', 'confirmed_slot'],
    defaultDuration: 60,
    askAddress: false,
  },
  restaurant: {
    services: (process.env.SERVICES || 'table reservation,private party booking,home delivery,catering').split(',').map(s => s.trim()),
    serviceLabel: 'reservation',
    staffLabel: 'staff',
    urgencyTriggers: [],
    bookingFields: ['full_name', 'callback_phone', 'service_type', 'confirmed_slot'],
    defaultDuration: 120,
    askAddress: false,
  },
  hvac: {
    services: (process.env.SERVICES || 'AC repair,AC installation,heating repair,plumbing,electrical,general maintenance').split(',').map(s => s.trim()),
    serviceLabel: 'service visit',
    staffLabel: 'technician',
    urgencyTriggers: ['gas leak', 'flooding', 'no power', 'fire', 'burst pipe', 'carbon monoxide'],
    bookingFields: ['full_name', 'callback_phone', 'service_address', 'service_type', 'issue_description', 'urgency_level', 'confirmed_slot'],
    defaultDuration: 120,
    askAddress: true,
  },
  general: {
    services: (process.env.SERVICES || 'consultation,booking,enquiry,support').split(',').map(s => s.trim()),
    serviceLabel: 'appointment',
    staffLabel: 'staff',
    urgencyTriggers: [],
    bookingFields: ['full_name', 'callback_phone', 'service_type', 'confirmed_slot'],
    defaultDuration: 60,
    askAddress: false,
  }
};

const config = SERVICE_CONFIGS[BUSINESS_TYPE] || SERVICE_CONFIGS.general;

// ============================================================
// GREETING & PERSONALITY based on language
// ============================================================
function getSystemPrompt() {
  const biz = require('./businessConfig');
  const services = config.services.join(', ');
  const isHinglish = LANGUAGE === 'hinglish';

  const hinglishNote = isHinglish ? `
LANGUAGE: Speak in Hinglish — natural mix of Hindi and English like Indians speak on phone.
Examples: "Haan ji, main aapki help kar sakta/sakti hoon", "Aapko kaunsi service chahiye?", "Main abhi check karta/karti hoon"
Use "ji" for respect. Keep it warm and natural, not robotic.` : '';

  const addressLine = config.askAddress
    ? `- Ask for their full address for the ${config.serviceLabel}`
    : '';

  return `You are ${AGENT_NAME}, a friendly and professional AI receptionist for ${biz.name}.

BUSINESS DETAILS:
- Business: ${biz.name}
- Type: ${BUSINESS_TYPE}
- Hours: ${biz.hours}
- Location/Service Area: ${biz.serviceAreas}
- Phone: ${biz.phone}

YOUR ROLE:
- Answer calls professionally and warmly
- Help callers book ${config.serviceLabel}s with our ${config.staffLabel}
- Handle enquiries about our services
- Escalate real emergencies immediately

SERVICES WE OFFER: ${services}

BOOKING FLOW:
1. Greet warmly, ask how you can help
2. Understand what service they need
3. ${config.urgencyTriggers.length > 0 ? `Check if it is an emergency (keywords: ${config.urgencyTriggers.join(', ')})` : 'Confirm the service needed'}
4. Collect caller name and phone number
${addressLine}
5. Call check_calendar tool to find available slots — NEVER guess availability
6. Offer 2-3 specific time slots
7. Confirm booking details verbally
8. Call save_booking_data tool to save the booking
9. Thank them and end warmly

RULES:
- NEVER make up available time slots — always use check_calendar first
- NEVER say you don't know — offer to take a message or transfer
- If outside business hours, apologize and offer to book for next available slot
- Keep responses SHORT and conversational — this is a phone call
- Do NOT say "I am an AI" or mention being artificial
- If caller is angry or upset, stay calm and empathetic
${hinglishNote}

PERSONALITY: Warm, professional, efficient. Like a great human receptionist — helpful, never robotic.`;
}

module.exports = {
  BUSINESS_TYPE,
  AGENT_NAME,
  LANGUAGE,
  serviceConfig: config,
  getSystemPrompt,
};
