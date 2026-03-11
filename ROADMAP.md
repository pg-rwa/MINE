# MINE — Roadmap to Real App

## Where We Are (Phase 0: Architecture Demo)
- Working API + web dashboard
- 15 agents with inline forms
- Permission system, data vault, audit log
- Deployed on Railway

## Phase 1: Foundation (Weeks 1-4)
> Make it a real app with real auth and persistence.

### 1.1 Authentication
- [ ] Add Supabase Auth (Google, Apple, Email login)
- [ ] JWT-based session management
- [ ] User profiles with plan management

### 1.2 Database
- [ ] PostgreSQL via Supabase for cloud data
- [ ] Migrate in-memory vault to real DB
- [ ] Encrypt sensitive fields (AES-256)

### 1.3 Mobile App Shell
- [ ] React Native (Expo) app scaffold
- [ ] Bottom tab navigation (Dashboard, Agents, Chat, Settings)
- [ ] Push notifications via Expo Notifications

---

## Phase 2: First Integrations (Weeks 5-10)
> Connect to real external services. Start with highest-value, easiest-to-integrate.

### Tier 1 — Easy & High Value (OAuth, well-documented)
| Integration | API | Auth | Cost | Agent |
|------------|-----|------|------|-------|
| Gmail | Gmail API | OAuth 2.0 | Free (quota) | Email Agent |
| Google Calendar | Calendar API | OAuth 2.0 | Free | Scheduler |
| Google Fit | Fitness API | OAuth 2.0 | Free | Fitness Agent |

### Tier 2 — Medium Effort, High Value
| Integration | API | Auth | Cost | Agent |
|------------|-----|------|------|-------|
| Banking (US/EU) | Plaid | OAuth + API key | $0.30/link | Finance Agent |
| Banking (India) | Setu AA | Account Aggregator | Per-consent | Finance Agent |
| Trading (India) | Zerodha Kite Connect | OAuth 2.0 | ₹2000/mo | Trading Agent |
| Trading (US) | Alpaca Markets | OAuth 2.0 | Free | Trading Agent |
| Telegram | Bot API | Bot Token | Free | Chat Agent |
| Slack | Slack API | OAuth 2.0 | Free | Chat Agent |

### Tier 3 — Hard but Valuable
| Integration | API | Auth | Cost | Agent |
|------------|-----|------|------|-------|
| WhatsApp | Business Cloud API | Business verification | Free (1000 msg/mo) | Chat Agent |
| Twitter/X | X API v2 | OAuth 2.0 | $100/mo (Basic) | Social Agent |
| Instagram | Graph API | Facebook OAuth | Free | Social Agent |
| LinkedIn | Marketing API | OAuth 2.0 | Free (limited) | Social Agent |

### Tier 4 — Workarounds Required (No official API)
| Integration | Approach | Agent |
|------------|----------|-------|
| Amazon orders | Email parsing (order confirmations) | Delivery Agent |
| Flipkart orders | Email parsing | Delivery Agent |
| Swiggy/Zomato | Email parsing | Delivery Agent |
| Utility bills | Email parsing + manual entry | Utility Agent |
| E-commerce prices | Web scraping (with user's permission) | Shopping Agent |

---

## Phase 3: Intelligence Layer (Weeks 11-16)
> Make agents actually smart with real AI.

### 3.1 Claude API Integration
- [ ] Connect Claude API for natural language routing
- [ ] Per-agent system prompts with user context
- [ ] Structured output for form generation
- [ ] RAG over user's vault data

### 3.2 Smart Features
- [ ] Spending pattern analysis
- [ ] Bill prediction & reminders
- [ ] Investment insights from portfolio data
- [ ] Email triage & summarization
- [ ] Smart replies for messages

---

## Phase 4: Monetization & Growth (Weeks 17-24)
> Ship the MVP, get users, monetize.

### 4.1 Freemium Model
- Free: 5 agents, manual data entry, basic AI
- Premium ($9.99/mo): All agents, integrations, full AI
- Pro ($24.99/mo): Custom agents, workflows, API access

### 4.2 Agent Marketplace
- [ ] SDK for third-party developers
- [ ] Review & verification system
- [ ] 70/30 revenue share

### 4.3 Distribution
- [ ] App Store & Play Store submission
- [ ] Landing page & waitlist
- [ ] Referral program

---

## Technical Architecture for Integrations

```
User's App (Gmail, Bank, etc.)
       │
       ▼
┌──────────────────────┐
│  OAuth Consent Screen │  ← User grants specific scopes
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Integration Gateway  │  ← Manages tokens, refresh, sync
│  ┌────────────────┐  │
│  │ Token Store     │  │  ← Encrypted OAuth tokens
│  │ (per user,     │  │
│  │  per service)  │  │
│  ├────────────────┤  │
│  │ Sync Engine    │  │  ← Scheduled data pulls
│  │ (per adapter)  │  │
│  ├────────────────┤  │
│  │ Webhook Recv   │  │  ← Real-time updates
│  └────────────────┘  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Data Normalizer      │  ← Converts API data → MINE format
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Data Vault           │  ← Encrypted, permission-checked
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Agent                │  ← Reads data, generates insights
└──────────────────────┘
```

## Key Design Decisions

### 1. Email Parsing as Universal Adapter
Most services send email confirmations. Parsing emails gives us:
- Order tracking (Amazon, Flipkart, etc.)
- Bill reminders (electricity, phone, etc.)
- Flight/hotel bookings
- Subscription tracking
- Bank transaction alerts

This is the FASTEST path to "connect everything" — just connect Gmail.

### 2. Account Aggregator (India) / Open Banking (EU/UK)
Regulatory frameworks that FORCE banks to share data with user consent.
- India: Setu AA, Finvu, OneMoney
- EU/UK: Open Banking APIs (PSD2)
- US: Plaid, MX, Finicity

### 3. Progressive Integration
Start with manual data entry → add email parsing → add direct API connections.
Each level adds convenience, not dependency.
