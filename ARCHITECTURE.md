# MINE - My Intelligent Network of Everything

## Vision
A personal super app where AI agents handle every aspect of your life — finances, properties, health, social, shopping, and beyond. The user is always in control. Agents only act with explicit permission.

---

## Core Principles

1. **User Sovereignty** — The user owns all data and controls all permissions. No agent acts without consent.
2. **Agent Modularity** — Each domain is an independent agent. Agents can be added, removed, or replaced without affecting others.
3. **Permission-First** — Every data access and action requires a scoped permission grant from the user.
4. **Offline-First** — Core data lives on-device. Cloud sync is optional and encrypted.
5. **Open Agent Protocol** — Third parties can build agents using our SDK. Users choose what to install.
6. **Monetization-Ready** — Freemium core with premium agents, storage, and advanced AI capabilities.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MINE App Shell                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Dashboard   │  │  Agent Store  │  │  Settings     │  │
│  │  (Unified    │  │  (Install/    │  │  (Permissions │  │
│  │   Feed)      │  │   Manage)     │  │   & Config)   │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│                   Conversation Layer                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Natural Language Router                         │    │
│  │  "Pay my electricity bill" → Utility Agent       │    │
│  │  "How's my portfolio?" → Trading Agent           │    │
│  │  "Plan dinner for 4" → Cooking Agent             │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│                    Agent Runtime                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Finance  │ │ Property │ │ Fitness  │ │ Shopping │  │
│  │ Agent    │ │ Agent    │ │ Agent    │ │ Agent    │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤  │
│  │ Tax      │ │ Social   │ │ Email    │ │ Trading  │  │
│  │ Agent    │ │ Agent    │ │ Agent    │ │ Agent    │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤  │
│  │ Utility  │ │ Delivery │ │ Cooking  │ │ Education│  │
│  │ Agent    │ │ Agent    │ │ Agent    │ │ Agent    │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤  │
│  │ Search   │ │ Chat     │ │ Ad-Hoc   │ │ ...more  │  │
│  │ Agent    │ │ Agent    │ │ Agent    │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────┤
│                  Core Services Layer                     │
│  ┌────────────┐ ┌────────────┐ ┌─────────────────────┐ │
│  │ Permission │ │ Data Vault │ │ Integration Gateway │ │
│  │ Engine     │ │ (Encrypted │ │ (OAuth, APIs,       │ │
│  │            │ │  Storage)  │ │  Scraping, Manual)  │ │
│  └────────────┘ └────────────┘ └─────────────────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌─────────────────────┐ │
│  │ Scheduler  │ │ Notifier   │ │ AI Engine           │ │
│  │ (Cron/     │ │ (Push,     │ │ (LLM Router,       │ │
│  │  Events)   │ │  In-App)   │ │  Embeddings, RAG)   │ │
│  └────────────┘ └────────────┘ └─────────────────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌─────────────────────┐ │
│  │ Audit Log  │ │ Workflow   │ │ Agent Marketplace   │ │
│  │            │ │ Engine     │ │ SDK                  │ │
│  └────────────┘ └────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                   Data Layer                             │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │ Local DB          │  │ Cloud Sync (Optional, E2EE) │ │
│  │ (SQLite/Realm)    │  │ (Postgres + S3 + Redis)     │ │
│  └──────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Permission Model

Permissions are **scoped**, **time-bound**, and **revocable**.

```
Permission = {
  agent_id:     "finance_agent",
  resource:     "bank_transactions",
  actions:      ["read"],
  scope:        "last_90_days",
  expires_at:   "2026-06-01T00:00:00Z",
  granted_at:   "2026-03-11T00:00:00Z",
  auto_renew:   false
}
```

### Permission Levels
| Level | Description | Example |
|-------|-------------|---------|
| `observe` | Read-only, no action | View bank balance |
| `suggest` | Can recommend actions, user approves | "You should pay this bill" |
| `act_with_approval` | Can prepare actions, user confirms | Draft email, user sends |
| `act_autonomously` | Fully autonomous within scope | Auto-pay bills under $100 |

---

## Agent Anatomy

Every agent follows the same contract:

```
Agent {
  id: string
  name: string
  description: string
  version: string

  // What this agent needs
  required_permissions: Permission[]
  optional_permissions: Permission[]

  // What this agent provides
  capabilities: Capability[]
  widgets: DashboardWidget[]

  // Lifecycle
  onInstall()
  onActivate(permissions)
  onDeactivate()
  onUninstall()

  // Core loop
  handleMessage(userMessage) -> AgentResponse
  handleEvent(systemEvent) -> AgentAction[]
  getInsights() -> Insight[]
  getWidgetData(widgetId) -> WidgetData
}
```

---

## Data Flow

### External App Integration
```
User's Bank App ──OAuth──> Integration Gateway ──> Data Vault ──> Finance Agent
User's Email   ──IMAP───> Integration Gateway ──> Data Vault ──> Email Agent
Manual Entry   ──Form───> Data Vault ──> Any Agent
File Upload    ──Parse──> Data Vault ──> Any Agent
```

### Agent-to-Agent Communication
Agents can request data from other agents (with user permission):
```
Tax Agent ──requests──> Finance Agent: "Get annual income summary"
                        Finance Agent ──responds──> {income: ..., deductions: ...}
```

---

## Monetization Strategy

### Free Tier
- 5 core agents (Finance, Fitness, Shopping, Search, Cooking)
- Manual data entry only
- Basic AI (smaller model)
- Local storage only

### Premium ($9.99/mo)
- All agents unlocked
- External app integrations (OAuth)
- Advanced AI (full model)
- Cloud sync with E2EE
- Scheduled automations
- Priority support

### Pro ($24.99/mo)
- Everything in Premium
- Ad-hoc agent creation (custom agents via natural language)
- Agent-to-agent workflows
- API access for personal automations
- Multi-device sync
- Family sharing (up to 5)

### Agent Marketplace (Revenue Share)
- Third-party agents: 70/30 split (developer/MINE)
- Featured placement: bidding system

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Mobile | React Native (Expo) | Cross-platform, fast iteration |
| Web | Next.js | SSR, shared React components |
| Backend | Node.js + Fastify | Fast, TypeScript everywhere |
| Database | PostgreSQL + SQLite | Cloud + local offline-first |
| Cache | Redis | Sessions, rate limiting, queues |
| AI | Claude API + local models | Best reasoning + privacy option |
| Auth | Supabase Auth | OAuth, MFA, social login |
| Storage | S3-compatible + E2EE | Files, documents, media |
| Queue | BullMQ | Background jobs, scheduling |
| Search | Typesense | Fast full-text + vector search |

---

## Key Differentiators

1. **Not a chatbot** — It's a command center with a chat interface as ONE option
2. **Not cloud-dependent** — Works offline, syncs when connected
3. **Not a walled garden** — Open agent SDK, user exports data anytime
4. **Not creepy** — User sees exactly what each agent knows and does
5. **Not another todo app** — Agents actually DO things, not just track them
