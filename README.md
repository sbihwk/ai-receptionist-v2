# AI Receptionist v2 — Complete System for Home Services

A production-ready AI receptionist that handles phone calls, SMS, WhatsApp, and website chat for HVAC, plumbing, and electrical businesses. It books appointments, detects emergencies, sends reminders, requests reviews, and delivers daily reports — all automatically.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND CHANNELS                         │
│  📞 Phone Call    💬 SMS/WhatsApp    🌐 Website Chat Widget     │
└──────┬──────────────────┬─────────────────────┬─────────────────┘
       │                  │                     │
       ▼                  ▼                     ▼
┌──────────────┐  ┌──────────────┐  ┌───────────────────┐
│  Twilio Voice │  │ n8n Workflow  │  │ POST /widget-chat │
│  + OpenAI     │  │ + OpenAI     │  │ + OpenAI          │
│  Realtime API │  │ GPT-4o-mini  │  │ GPT-4o-mini       │
└──────┬────────┘  └──────┬───────┘  └────────┬──────────┘
       │                  │                    │
       ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED DATA LAYER                            │
│  📊 Airtable (Leads, ConversationHistory, Analytics)           │
│  📅 Google Calendar (per-tech scheduling)                      │
│  📱 Twilio SMS (confirmations, reminders, reviews)             │
│  📧 Nodemailer (tech dispatch, emergency alerts, daily digest) │
└─────────────────────────────────────────────────────────────────┘
```

## What This System Does

| Feature | Description |
|---------|-------------|
| **Voice Calls** | Answers calls via Twilio + OpenAI Realtime API with natural voice |
| **SMS/WhatsApp** | Handles text conversations via n8n workflow |
| **Website Chat** | Embeddable chat widget for any website |
| **Smart Booking** | Checks real Google Calendar availability, books appointments |
| **Emergency Detection** | Instantly flags gas leaks, flooding, CO, electrical fires |
| **Returning Customers** | Recognizes callers and references their history |
| **Confirmation SMS** | Sends booking confirmation with all details |
| **24h & 1h Reminders** | Automated appointment reminders |
| **Review Requests** | Sends Google review link 4 hours after service |
| **30-Day Follow-ups** | Check-in SMS one month after service |
| **Daily Digest** | Email report at 6pm with day's stats |
| **Tech Dispatch** | Emails technician with full job card + Google Maps link |
| **Owner Alerts** | SMS + call for emergencies, SMS for new bookings |
| **Lead Capture** | Saves price inquiries, complaints, hesitant callers |
| **Transfer to Human** | Graceful handoff when caller insists |

## Prerequisites

You need accounts with:

1. **Twilio** — Phone number with voice + SMS capability
2. **OpenAI** — API key with access to `gpt-4o-realtime-preview-2024-12-17` and `gpt-4o-mini`
3. **Google Cloud** — OAuth2 credentials for Google Calendar API
4. **Airtable** — Free/Pro account with a base
5. **SMTP Email** — Gmail app password or other SMTP provider
6. **Railway** (or similar) — For hosting the Node.js server
7. **n8n** (optional) — Self-hosted or cloud for SMS/WhatsApp workflow

## Installation

### 1. Clone and install

```bash
git clone <your-repo-url> ai-receptionist-v2
cd ai-receptionist-v2
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with all your credentials
```

### 3. Create Airtable tables

Create these tables in your Airtable base with these exact names and fields:

**Leads**
| Field | Type |
|-------|------|
| FullName | Single line text |
| Phone | Phone |
| ServiceAddress | Single line text |
| ServiceType | Single select (hvac, plumbing, electrical, other) |
| IssueDescription | Long text |
| UrgencyLevel | Single select (emergency, today, this_week, flexible) |
| ConfirmedSlot | Single line text |
| AppointmentDatetime | Date (include time) |
| Status | Single select (BOOKED, LEAD, EMERGENCY, CANCELLED, COMPLETED, COMPLAINT) |
| BookingId | Single line text |
| CalendarEventId | Single line text |
| Intent | Single select (price_inquiry, complaint, just_browsing, follow_up_needed, not_ready, website_chat) |
| ServiceInterest | Single line text |
| Channel | Single select (voice, sms, whatsapp, widget) |
| UpsellMentioned | Checkbox |
| UpsellInterested | Checkbox |
| CustomerMood | Single select (happy, neutral, frustrated, angry) |
| HowTheyFoundUs | Single line text |
| CallNotes | Long text |
| EmergencyType | Single line text |
| SafetyStatus | Single select (safe, unsafe, unknown) |
| Reminder24hSent | Checkbox |
| Reminder1hSent | Checkbox |
| ReviewRequestSent | Checkbox |
| FollowUp30DaySent | Checkbox |
| CreatedAt | Date (include time) |

**ConversationHistory**
| Field | Type |
|-------|------|
| CallSid | Single line text |
| Transcript | Long text |
| Summary | Long text |
| CreatedAt | Date (include time) |

**ConversationAnalytics**
| Field | Type |
|-------|------|
| CallSid | Single line text |
| Duration | Number |
| CallClassification | Single line text |
| ServiceType | Single line text |
| BookingMade | Checkbox |
| EmergencyDetected | Checkbox |
| TransferRequested | Checkbox |
| CustomerMood | Single select |
| UpsellMentioned | Checkbox |
| UpsellInterested | Checkbox |
| CallerPhone | Phone |
| ReturningCustomer | Checkbox |
| Channel | Single select |
| CreatedAt | Date (include time) |

**Businesses**
| Field | Type |
|-------|------|
| BusinessId | Single line text |
| Name | Single line text |
| Phone | Phone |
| DispatchFee | Single line text |
| Hours | Single line text |
| ServiceAreas | Single line text |

**Reminders** and **BillingTickets** — create empty for future use.

### 4. Start the server

```bash
# Development
npm run dev

# Production
npm start
```

## Google Calendar OAuth Setup

This is the most critical setup step. Follow exactly:

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project: "AI Receptionist"
3. Enable **Google Calendar API**

### Step 2: Create OAuth Credentials
1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Authorized redirect URIs: `https://developers.google.com/oauthplayground`
5. Save the **Client ID** and **Client Secret**

### Step 3: Get Refresh Token
1. Go to [OAuth Playground](https://developers.google.com/oauthplayground)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. In the left panel, find "Google Calendar API v3"
6. Select `https://www.googleapis.com/auth/calendar`
7. Click "Authorize APIs" → sign in with the Google account that has the calendars
8. Click "Exchange authorization code for tokens"
9. Copy the **Refresh Token**

### Step 4: Add to .env
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

### Step 5: Set Calendar IDs
- For a single technician: use `primary` for all
- For multiple: find Calendar ID in Google Calendar Settings → each calendar → "Integrate calendar" section

## Railway Deployment

1. Push code to GitHub
2. Go to [Railway](https://railway.app)
3. New Project → Deploy from GitHub repo
4. Add all environment variables from `.env`
5. Set `SERVER_URL` to your Railway domain (e.g., `https://your-app.up.railway.app`)
6. Deploy

## Twilio Configuration

1. Get a phone number in Twilio Console
2. Under Phone Number → Configure:
   - **Voice & Fax → A Call Comes In**: Webhook → `https://your-domain.com/incoming-call` (POST)
   - **Voice & Fax → Call Status Changes**: `https://your-domain.com/call-status` (POST)
   - **Messaging → A Message Comes In**: Webhook → `https://your-domain.com/sms-incoming` (POST)

## n8n Import and Setup

1. Open your n8n instance
2. Go to Workflows → Import from File
3. Select `n8n-workflow.json`
4. Configure credentials:
   - **Airtable API Key**: Create HTTP Header Auth credential with `Authorization: Bearer YOUR_AIRTABLE_KEY`
   - **OpenAI API Key**: Create HTTP Header Auth credential with `Authorization: Bearer YOUR_OPENAI_KEY`
5. Set environment variables in n8n: `AIRTABLE_BASE_ID`, `BUSINESS_NAME`, `BUSINESS_PHONE`
6. Activate the workflow
7. Note the webhook URL — use it for SMS/WhatsApp integrations

## Chat Widget Installation

Add this single line to any website's HTML, before `</body>`:

```html
<script src="https://your-domain.com/chat-widget.js" data-widget-url="https://your-domain.com"></script>
```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default 3000) | No |
| `SERVER_URL` | Full public URL (https://...) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `TWILIO_FROM` | Twilio phone number (+1...) | Yes |
| `BUSINESS_NAME` | Business display name | Yes |
| `BUSINESS_PHONE` | Business phone number | Yes |
| `BUSINESS_EMAIL` | Business email | Yes |
| `OWNER_EMAIL` | Owner email for alerts/digest | Yes |
| `MANAGER_EMAIL` | Manager email for complaints | Yes |
| `*_TECH_EMAIL` | Technician emails per service | Yes |
| `EMERGENCY_SMS_TO` | Emergency SMS recipient | Yes |
| `OWNER_PHONE` | Owner phone for emergency calls | Yes |
| `ON_CALL_TECH_PHONE` | On-call tech phone | Yes |
| `AVERAGE_TICKET_VALUE` | Average job value in $ | No |
| `DISPATCH_FEE` | Dispatch fee display string | No |
| `BUSINESS_HOURS` | Human-readable hours | No |
| `SERVICE_AREAS` | Service area description | No |
| `TIME_ZONE` | IANA timezone | No |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Yes |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth Refresh Token | Yes |
| `*_CALENDAR_ID` | Google Calendar IDs per service | No |
| `GOOGLE_REVIEW_LINK` | Google review URL | No |
| `AIRTABLE_API_KEY` | Airtable Personal Access Token | Yes |
| `AIRTABLE_BASE_ID` | Airtable Base ID (app...) | Yes |
| `SMTP_HOST` | SMTP server host | Yes |
| `SMTP_PORT` | SMTP server port | No |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password/app password | Yes |

## Testing with curl

### Health check
```bash
curl http://localhost:3000/health
```

### Simulate incoming call
```bash
curl -X POST http://localhost:3000/incoming-call \
  -d "CallSid=CA_test_123&From=+15551234567&To=+15559876543"
```

### Dashboard data
```bash
curl http://localhost:3000/dashboard-data
```

### Widget chat
```bash
curl -X POST http://localhost:3000/widget-chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I need my AC fixed","sessionId":"test-1","userName":"John","userPhone":"+15551234567"}'
```

### Simulate inbound SMS
```bash
curl -X POST http://localhost:3000/sms-incoming \
  -d "From=+15551234567&Body=I need to schedule a plumbing appointment&MessageSid=SM_test_123"
```

## Selling This to Clients

### Pricing Tiers

| Tier | Price/month | Includes |
|------|-------------|----------|
| **Starter** | $497 | Voice AI + SMS + 500 minutes |
| **Professional** | $997 | + Chat widget + Calendar + Reviews |
| **Enterprise** | $1,997 | + Multi-location + Custom prompts + Priority |

### Demo Script

1. "Let me call your business number right now..."
2. Show the AI answering naturally
3. Book a fake appointment — show calendar event + SMS confirmation appear in real-time
4. Show the dashboard with today's stats
5. "This runs 24/7, never calls in sick, and costs less than a part-time employee"

### Objection Handling

| Objection | Response |
|-----------|----------|
| "Customers want a real person" | "95% of callers can't tell the difference. And it never puts them on hold." |
| "It's too expensive" | "A receptionist costs $3,000+/month. One missed emergency call costs more than a year of this." |
| "What if it makes a mistake?" | "It flags anything it's unsure about for human review. And it records every call." |
| "I already have a receptionist" | "Great — this handles after-hours, weekends, and overflow. Your receptionist will love it." |

## Troubleshooting

### Common Issues

**"WebSocket connection failed"**
- Ensure `SERVER_URL` uses `https://` (not `http://`)
- Check that your hosting provider supports WebSocket connections
- Verify the `/media-stream` path is not blocked by a reverse proxy

**"Google Calendar 401 Unauthorized"**
- Refresh token may have expired — regenerate via OAuth Playground
- Ensure Calendar API is enabled in Google Cloud Console
- Check that the Google account has access to the specified calendars

**"Airtable 422 Error"**
- Field names in code must exactly match Airtable column names (case-sensitive)
- Check that single select fields have the expected options created
- Verify `AIRTABLE_BASE_ID` starts with `app`

**"Twilio 11200 HTTP Retrieval Failure"**
- Your server must be publicly accessible (not localhost)
- Response must be valid TwiML XML
- Check server logs for errors on the `/incoming-call` route

**"No audio / silence on call"**
- Verify `OPENAI_API_KEY` has access to the realtime model
- Check that audio format is `g711_ulaw` in both directions
- Ensure `streamSid` is being captured from the Twilio `start` event

**SMS not sending**
- Verify `TWILIO_FROM` number has SMS capability
- Check Twilio account has sufficient balance
- For WhatsApp: number must be registered in Twilio WhatsApp sandbox

**n8n workflow errors**
- Ensure HTTP Header Auth credentials are set with `Authorization: Bearer <key>` format
- Check that environment variables are set in n8n settings
- Verify webhook URL is accessible from the internet
#   r e d e p l o y   0 5 / 1 9 / 2 0 2 6   1 7 : 5 4 : 3 9  
 