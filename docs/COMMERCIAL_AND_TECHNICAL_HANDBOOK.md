# CustomCare — Technical & Commercial Readiness Handbook

**Platform:** CustomCare (`https://getcustomcare.xyz`)  
**Repository:** `https://github.com/crazyBuddhaa/careflow`  

This document contains the 12 core technical, operational, integration, and commercial readiness guides for client presentation and enterprise onboarding.

---

## 1. System Architecture Overview

CustomCare is a multi-tenant, multi-channel customer support and workforce operations platform built on a Cloudflare-first architecture:

- **Application Layer (`apps/web`)**: Next.js 16 App Router serving Customer Support Portals, the Unified Agent & Supervisor Workspace, the Business Administrator Command Center, the Central Platform Super-Admin Console, and the Telegram Mini App (`/tg-app`).
- **Embeddable Channel SDK (`apps/widget`)**: Lightweight, zero-dependency JavaScript widget that embeds into any external website via a single `<script>` tag and communicates with `/api/widget/[publicToken]` with per-token origin validation.
- **Relational Data & Evidence Layer (`packages/database` — Cloudflare D1 / SQLite)**:
  - Enforces strict tenant isolation via mandatory `organization_id` foreign keys and SQLite `BEFORE INSERT / UPDATE` triggers.
  - Protects sensitive credentials (Telegram bot tokens, customer login credentials on claims, and replacement stock credentials) with **AES-256-GCM encryption at rest**.
  - Stores complaint evidence (`complaint_evidence.file_url_or_data` inline data URLs/links) and channel attachment metadata (`conversation_attachments` with Telegram `external_file_id` streamed via `/api/admin/attachments/[id]`) directly in Cloudflare D1 without requiring an external R2 bucket.
- **Messaging & Webhook Gateway**: Native Telegram Bot API integration supporting both Central Bot deep-linking (`@getcustomcarebot`) and Dedicated Business Sub-Bots with idempotent webhook processing.

---

## 2. Customer Support Workflow

All customer touchpoints—Website Widget, Customer Support Portal, and Telegram Bot—feed into a single unified conversation lifecycle:

1. **Enquiry Intake & Identification**: Customer opens the Website Widget, visits `/portal/[businessSlug]`, or messages the business Telegram Bot. CustomCare identifies or provisions a `channel_customer_identities` record scoped to the business.
2. **Knowledge Search & Guided Troubleshooting**: Customer searches published FAQs/articles or walks through deterministic troubleshooting steps grounded strictly in approved business knowledge.
3. **Human Escalation / Complaint Submission**:
   - If the issue requires a human specialist, the conversation enters the Unified Support Inbox (`status = 'open'` or `'escalated'`).
   - For product, account, or deposit issues, customers submit a structured complaint (Order ID, product/service, category-specific fields, optional encrypted login details, and screenshot evidence) and receive a unique reference code (`CLM-YYYY-XXXXXX`).
4. **Resolution & CSAT Feedback**: Once resolved, the customer receives a real-time update on their original channel (Portal, Widget, or Telegram) and can submit a 1–5 star Customer Satisfaction (CSAT) rating.

---

## 3. Agent and Supervisor Workflow

CustomCare enforces a clear operational chain of responsibility:

`CUSTOMER → SUPPORT AGENT → SUPERVISOR → SPECIALISED PERSONNEL → RESOLUTION`

### A. Support Agent Workspace
- **Unified Inbox**: Filter by *Assigned to Me*, *Unassigned*, *Escalated*, *Open*, *Pending*, *High/Urgent Priority*, or *Resolved*, and filter by channel (*Portal*, *Web Widget*, *Telegram*).
- **Grounded AI & Knowledge Copilot**: Generates draft replies using **only** published business knowledge articles, FAQs, and configured support procedures—never inventing company policies.
- **Claims Creation & Fulfilment**: Agents can file complaints directly from any conversation, attach evidence, add private internal notes, escalate to supervisors, and (when authorized under Method 2: Agent-Assisted Fulfilment) allocate and deliver replacement credentials.
- **Guardrail**: Agents cannot approve or decline complaints unless explicitly authorized by an administrator.

### B. Supervisor Workspace
- **7 Dedicated Operational Queues**: *Pending Review*, *In Progress*, *Awaiting Information*, *Approved*, *Awaiting Replacement*, *Declined*, and *Resolved*.
- **Investigation & Decision Enforcement**: Supervisors inspect order history, duplicate order flags, and customer evidence, and securely reveal encrypted credentials (logged in the audit trail). Every approval, decline, or info request requires a mandatory supervisor reason.
- **Specialised Personnel Escalation & Return-to-Agent**: Supervisors can assign complex cases to Specialised Personnel (e.g., *Deposit & Billing Verification*, *Tier-3 Technical*, *Security & Compliance*) or return cases to agents with explicit instructions.
- **Quality Assurance (QA) Evaluations**: Supervisors score agent conversations across Accuracy, Professionalism, and Resolution Effectiveness (1–5 scale), account for case complexity, and record coaching recommendations.

---

## 4. Administrator Operations Guide

Business Owners and Administrators control all aspects of their workspace from `/admin`:
1. **Operations & Backlog Command Center**: Track real-time KPIs (Unique Customers Attended, Conversations Handled, Tickets, Product Complaints, Replacements Issued, First Response Time, Resolution Time, SLA Compliance %, and CSAT).
2. **Advanced Backlog Management**: Filter active backlog cases by *Department*, *Agent*, *Supervisor*, *Category*, *Priority*, *Status*, *Age*, and *SLA Condition* (*Approaching SLA*, *Overdue >24h*, *Critical >48h*, *Awaiting Customer*, *Awaiting Agent*, *Awaiting Supervisor*, *Awaiting Specialist*, *Reopened*).
3. **Replacement Inventory Management**: Manage stock categories, batches, bulk imports, expiration dates, and minimum stock alerts, and choose between **Method 1 (Supervisor-Controlled)** and **Method 2 (Agent-Assisted)** replacement fulfilment.
4. **Performance Management & QA**: Review Agent Scorecards (Daily, Weekly, Monthly views, SLA compliance, QA scores, workload complexity) and Supervisor turnaround metrics.
5. **Workflow Automation Engine**: Configure no-code automation rules for auto-assignment, auto-categorisation, conditional escalation, overdue supervisor alerts, unavailable-agent reassignment, SLA warnings, customer status updates, and pending case follow-ups.
6. **Daily, Weekly & Monthly Closing Reports**: Generate and export official operational closing statements in CSV, Excel (`.xls`), or Print/PDF format.

---

## 5. Website Integration Guide

Any business can embed the CustomCare support widget on their website in under two minutes:

1. Open **Admin Console → Telegram & Channels → Website Support Widget** and click **Activate Web Widget**.
2. Copy the generated `publicToken` snippet and paste it before the closing `</body>` tag of your website:

```html
<script
  src="https://getcustomcare.xyz/widget.js"
  data-customcare-token="YOUR_PUBLIC_WIDGET_TOKEN"
  data-business-slug="your-business-slug"
  async
></script>
```

3. **Capabilities Included Automatically**:
   - Custom brand colors and welcome message from your workspace settings.
   - Instant knowledge base search and guided troubleshooting.
   - Live conversation continuity and human agent handoff.
   - Mobile-responsive floating launcher.

---

## 6. Telegram Integration Guide

CustomCare supports two native Telegram operating modes that feed directly into the same Unified Inbox:

### Mode A: Central CustomCare Bot (`@CustomCareBot`)
- Zero BotFather setup required.
- Activate **Central Telegram Bot** in **Telegram & Channels** to receive your unique customer deep link (`https://t.me/CustomCareBot?start=biz_<token>`) and QR code.
- Customers clicking the link are automatically routed to your business workspace.

### Mode B: Dedicated Business Sub-Bot
- Create a bot via `@BotFather` on Telegram and paste the Bot Token into **Telegram & Channels → Dedicated Sub-Bot**.
- CustomCare encrypts the token at rest with AES-256-GCM and registers the webhook at `/api/webhooks/telegram/subbot/[integrationId]`.

### Agent Telegram Linking & Mini App (`/tg-app`)
- Agents generate a 6-digit one-time link code in their workspace and send `/link <CODE>` to the bot.
- Agents receive instant Telegram notifications on new/escalated cases and can launch the **Telegram Mini App (`/tg-app`)** to reply and manage queues from mobile.

---

## 7. Feature Catalogue (Production Availability Matrix)

| Capability Category | Currently Available in Production | Optional Future Enhancements |
| :--- | :--- | :--- |
| **Customer Channels** | Hosted Support Portal, Website Widget API, Telegram Central Bot, Telegram Dedicated Sub-Bot, Telegram Mini App | WhatsApp Business Cloud API, Native iOS/Android Push SDK |
| **Agent & Supervisor Ops** | Unified Inbox, Internal Notes, Saved Replies, Grounded KB Copilot, 7 Supervisor Queues, Specialised Personnel Routing | Live Voice/Video Co-Browsing |
| **Claims & Inventory** | Configurable Complaint Forms, Duplicate Order Detection, AES-256-GCM Credential Vault, Atomic Stock Reservation (Methods 1 & 2) | Automated ERP/Webhook Restock Sync |
| **Performance, QA & Analytics** | Meaningful Action Tracking, Agent Scorecards (Daily/Weekly/Monthly), Supervisor QA Evaluations, Channel & Trend Analytics, CSV/Excel/Print Closing Reports | Predictive Staffing Forecasting |
| **Workflow Automation** | 8 Configurable Rule Types with Loop Prevention & Execution Audit Logs | Visual Drag-and-Drop Webhook Builder |

---

## 8. Development Roadmap (Stages 0–9)

| Stage | Deliverable | Status |
| :--- | :--- | :--- |
| **Stage 0** | Comprehensive Repository Audit & Technical Assessment | **Completed** |
| **Stage 1** | Customer Support Portals, Channels & CSAT Feedback Validation | **Completed** |
| **Stage 2** | Complete Unified Agent Workspace & Grounded AI Copilot | **Completed** |
| **Stage 3** | Supervisor Workspace, 7 Queues & Specialised Personnel Routing | **Completed** |
| **Stage 4** | Administrator Command Center & Multi-Dimensional Backlog Management | **Completed** |
| **Stage 5** | Workforce Performance Management, Scorecards & Supervisor QA Module | **Completed** |
| **Stage 6** | Executive Channel, Category, Workforce & Trend Analytics + Closing Reports | **Completed** |
| **Stage 7** | Configurable Workflow Automation Engine with Audit Trail | **Completed** |
| **Stage 8** | Multi-Tenant Security, Concurrency & Production QA Verification | **Completed** |
| **Stage 9** | Interactive Demonstration Environment & Commercial Documentation | **Completed** |

---

## 9. Technical Requirements

- **Runtime**: Node.js 22+ (local/container) or Cloudflare Workers runtime (`@opennextjs/cloudflare`).
- **Database & Evidence Persistence**: Cloudflare D1 (`customcare-db`, SQLite 3.45+) with foreign keys and triggers enabled; stores relational tables, inline complaint evidence (`complaint_evidence`), and channel attachment metadata (`conversation_attachments`).
- **Transactional Email**: Resend API (`RESEND_API_KEY`) for verification, invitations, and password resets.
- **Bot Defense**: Cloudflare Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).

---

## 10. Implementation Timeline

- **Week 1 (Completed)**: Core Multi-Tenant Foundation, Authentication, RBAC, and Knowledge Base Engine.
- **Week 2 (Completed)**: Unified Multi-Channel Inbox, Telegram Central/Sub-Bot & Mini App Integration, and Claims & Replacement Inventory Vault.
- **Week 3 (Completed)**: Supervisor Queues, Specialised Personnel Escalation, Advanced Backlog Filters, Agent Scorecards, QA Evaluations, Workflow Automation Engine, and Demonstration Suite.

---

## 11. Infrastructure Cost Breakdown (Cloudflare-First Architecture)

| Component | Service Tier | Estimated Monthly Cost (Startup / SMB) | Estimated Monthly Cost (Growth / Enterprise) |
| :--- | :--- | :--- | :--- |
| **Compute & Hosting** | Cloudflare Workers | $0 (Free Tier) – $5 / month (Workers Paid) | $5 / month base (Workers Paid, includes 10M requests) |
| **Relational Database & Evidence** | Cloudflare D1 (`customcare-db`) | $0 (Free 5M rows read/day) | $0 – $5 / month (Included in Workers Paid + overage) |
| **Transactional Email** | Resend | $0 (Free 3,000 emails/month) | $20 / month (50,000 emails) |
| **Bot Defense & DNS/SSL** | Cloudflare Turnstile & DNS | $0 (Included) | $0 (Included) |
| **Total Estimated Infrastructure** | — | **$0 – $5 / month** | **$25 – $30 / month** |

---

## 12. Commercial Proposal Structure

1. **Executive Summary**: Centralizing multi-channel customer enquiries (Website, Portal, Telegram), claims verification, replacement inventory, and workforce accountability into one platform.
2. **Operational Pain Points Solved**:
   - Eliminates fragmented WhatsApp/Telegram staff groups and spreadsheet stock tracking.
   - Prevents unauthorized complaint approvals and double-issued replacement credentials.
   - Replaces passive "online status" indicators with verifiable agent and supervisor activity metrics.
3. **Deployment & Onboarding Package**:
   - 7-Step Guided Business Onboarding.
   - Custom Portal & Widget Branding.
   - Knowledge Base & Replacement Stock Bulk Import.
   - Staff Role Provisioning (Owners, Admins, Supervisors, Agents, Viewers) & Training.
