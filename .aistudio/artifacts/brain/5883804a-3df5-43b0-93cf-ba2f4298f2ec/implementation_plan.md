# CustomCare – Role-Based Registration, Agent & Workspace Management, Brand Identity, Legal Compliance & Central Platform Admin

This update upgrades CustomCare with a role-selective registration flow (**Register as a Business** vs. **Register as a Support Agent**) with cross-role activation inside the web dashboard, full employee invitation & membership management (**Business-Managed Agents** vs. **Registered CustomCare Users**), the official **.CUSTOMCARE** brand logo & favicon system, comprehensive **Privacy Policy, Terms of Use & Compliance** pages, and a **Central CustomCare Platform Admin Dashboard** so you can manage every business, user, Telegram webhook, and security control directly from the browser without ever touching the CLI.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> This revised plan incorporates all of your latest instructions alongside your earlier confirmed choices:

- **Role Selection at Registration + Cross-Role Expansion in Dashboard**:
  - When registering on the website, users choose whether they are signing up as a **Business** (provisions their personal account + their initial business workspace) or as a **Support Agent** (creates their personal CustomCare agent account without forcing them to create a business).
  - **Cross-Role Setup Anytime**: Inside the web dashboard, an Agent can click **"Register / Launch a Business Workspace"** at any time to become a Business Owner, and a Business Owner can **accept agent invitations or link existing agent identities** from other businesses—switching between their own business command center and external agent desks from one login.
- **Telegram Business Onboarding Placed on Hold**:
  - Business registration and onboarding are handled exclusively through the website (`https://getcustomcare.xyz`). `@getcustomcarebot` will not run conversational business registration; instead, it directs prospective business owners to the website while continuing to power customer support links, dedicated `@BotFather` sub-bots, and agent `/link` codes.
- **Official `.CUSTOMCARE` Logo & Favicon Assets**:
  - All brand headers, auth screens, landing pages, footers, and browser favicons (`icon`, `apple-touch-icon`, OpenGraph image) will use your uploaded `.CUSTOMCARE` minimalist circular headset mark and typography lockups.
- **Privacy Policy, Terms of Use & Compliance Center**:
  - Dedicated public legal & compliance pages (`/privacy`, `/terms`, `/compliance`) plus registration consent acknowledgements and footer links across the marketing site, login/registration screens, and customer portals.
- **Central CustomCare Platform Admin Dashboard (Zero-CLI Operations)**:
  - A dedicated **Platform Super-Admin Console** (`/platform-admin` + top-bar switcher for platform administrators such as `asuracorps@gmail.com`) allowing you to oversee and manage all businesses, workspaces, users, agent invitations, Telegram webhooks, rate limits, and audit logs directly from the website.

---

## 1. Overview & Core Concept

1. **Role-Selective Web Registration & Cross-Role Dashboard**:
   - **Business Registration Path**: Collects owner details + initial business profile and provisions an isolated workspace ready for the 7-step setup.
   - **Support Agent Registration Path**: Collects the agent's name, email, password, and specialty—creating a personal CustomCare account without creating a dummy business. The agent lands in their **Agent Hub** where they can accept workspace invitations by token/email, link an existing business-managed agent identity, or later launch a business of their own.
   - **Cross-Role Toggle in Dashboard**: Every user's dashboard includes a **"Roles & Workspaces"** section in `My Account` allowing an Agent to create a Business Workspace or a Business Owner to accept Agent Invitations for other companies.
2. **Agent Invitation System & Dual Access Models (`agent_identities` vs. `users`)**:
   - **Business-Managed Agent (Default)**: Invited employees can accept an invitation (`/invite/[token]`), verify their email, set a workspace password, and work strictly inside that business's workspace without registering a personal CustomCare account.
   - **Registered CustomCare User (Optional)**: Agents with a personal account (or who link their existing agent identity with explicit consent) can join multiple businesses and switch between active workspaces from a single login.
   - **Full Membership Lifecycle**: Business administrators can **Invite**, **Suspend**, **Reactivate**, or **Revoke** agents with immediate per-workspace session invalidation, while agents can **Voluntarily Leave** (automatically returning their open conversations to the unassigned queue).
3. **Official `.CUSTOMCARE` Brand Identity & Favicon**:
   - Integrates your uploaded assets across the application:
     - **Icon Mark** (`/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000821_1_12ad5e9f.png`): Used for the browser favicon, app icon, compact sidebar brand badge, and auth badges.
     - **Brand Lockups** (`/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000722_2_8854e50e.png` & `/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000639_0000_84dc5aab.png`): Used in the landing showcase, auth/onboarding brand showcase, and compliance/footer headers.
4. **Privacy Policy, Terms of Use & Compliance**:
   - Complete legal and compliance documentation accessible at `/privacy`, `/terms`, and `/compliance`, covering multi-tenant data isolation, customer & agent privacy, Telegram Bot API message handling, AI assistant guardrails, cookie/session security, and GDPR/NDPR data rights.
5. **Central CustomCare Platform Admin Dashboard (`/platform-admin`)**:
   - A comprehensive web control center for the CustomCare platform owner so no CLI commands are needed for day-to-day operations:
     - **Platform KPIs & System Health**: Real-time counts of businesses, published portals, registered users, business-managed agents, active sessions, conversations, and D1 database health.
     - **Tenant & Business Directory**: Search, filter, inspect, suspend/reactivate, publish/unpublish, or open any business workspace on the platform.
     - **Global Users, Agents & Invitations Manager**: Inspect all personal accounts, business-managed agents, and workspace invitations; manually verify emails, clear rate-limit cooldowns, revoke sessions, or grant platform admin privileges.
     - **Telegram & Webhook Operations Center**: View `@getcustomcarebot` status and all business sub-bots, trigger 1-click **Register / Sync Central Telegram Webhook & Slash Commands** directly from the browser, and inspect recent `webhook_event_logs` and delivery statuses.
     - **Platform Audit & Security Stream**: Live filterable log of all security events, login lockouts, membership changes, and administrative actions across the site.

---

## 2. User Experience & Visual Design

### Brand Identity Preview

![.CUSTOMCARE Official Brand Lockup](/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000639_0000_84dc5aab.png)

### Key User Flows

1. **Account Registration (`/onboarding` & `/login`)**:
   - Step 1 presents a crisp two-card role selector:
     - **I am registering a Business** — *"Create an isolated support workspace for my company, configure Telegram & web channels, and invite my team."*
     - **I am a Support Agent** — *"Create a personal agent account to accept workspace invitations, support multiple businesses, or link my existing agent identity."*
   - Includes a mandatory compliance acknowledgement checkbox linking to the **Terms of Use**, **Privacy Policy**, and **Data Compliance Notice**.

2. **Cross-Role Expansion in Web Dashboard**:
   - **For Agents wanting to start a Business**: In the Agent Dashboard header and `My Account` tab, a **"Launch a Business Workspace"** card lets them register a business at any time without creating a second login.
   - **For Business Owners wanting to act as an Agent**: In the Business Command Center's `Account & Security` / workspace switcher, an **"Accept Agent Invitation / Join Another Workspace"** action lets them accept an invitation token or view pending invitations sent to their email address, seamlessly switching between their Owner workspace and Agent workspace(s).

3. **Team Management & Invitation Acceptance (`/invite/[token]`)**:
   - Business Admins click **Invite Agent** under **Inbox & Team → Team & Specialists**, specifying email, role (`Admin`, `Supervisor`, `Agent`, `Viewer`), department, and granular permissions.
   - The invited employee opens `/invite/[token]` and can either:
     - **Join as a Business-Managed Agent (Default)**: Set a workspace password and enter that business's support desk directly without creating a personal CustomCare account.
     - **Connect to a Personal CustomCare Account (Optional)**: Link the workspace membership to a new or existing personal CustomCare account with explicit consent and verified email ownership.

4. **Central CustomCare Platform Admin Dashboard (`/platform-admin`)**:
   - Accessible to platform super-admins via a dedicated **"Platform Admin"** button in the top navigation bar or directly at `/platform-admin`.
   - Organized into 5 clean horizontal tabs:
     1. **Platform Overview**: Global KPIs, onboarding funnel metrics, channel activity breakdown, and system environment status.
     2. **Businesses & Workspaces**: Complete table of every registered business with status indicators, owner info, conversation/agent counts, and 1-click actions (**Inspect / Enter Workspace**, **Suspend / Activate Business**, **Toggle Portal Publish**).
     3. **Users, Agents & Invitations**: Unified directory of Registered Users (`users`), Business-Managed Agents (`agent_identities`), and Workspace Invitations (`workspace_invitations`) with actions to **Verify Email**, **Clear Rate Limit Lockout**, **Revoke Active Sessions**, or **Revoke Invite**.
     4. **Telegram & Webhooks Control**: Live webhook inspector and 1-click **Sync `@getcustomcarebot` Webhook & Bot Commands** button (eliminating the need to run CLI webhook scripts), plus a table of all connected business sub-bots and recent webhook logs.
     5. **Security & Audit Logs**: Platform-wide security and membership audit trail with search and event-type filtering.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Pausing Telegram Business Onboarding in Favor of Web-First Registration**
  - *Chosen Approach*: Keep business registration and guided onboarding strictly on the web application (`https://getcustomcare.xyz/onboarding`), while `@getcustomcarebot` serves customer support deep links, agent mobile linking (`/link`), and directs business registration inquiries to the website.
  - *Why*: Keeps the Telegram bot fast and focused while ensuring business owners review compliance terms and configure their workspace on a rich visual interface.
- **Decision 2: First-Class Agent-Only Personal Accounts (`users` with 0 initial owned businesses)**
  - *Chosen Approach*: Allow `users` to register without requiring an immediate row in `organizations`. When an agent registers a personal account, CustomCare automatically links any pending invitations or existing `agent_identities` matching their verified email (with explicit consent) and displays their **Agent Workspace Hub**.
  - *Why*: Supports both standalone agents waiting for or accepting an employer's invitation and multi-workspace specialists, while still allowing them to create a business workspace later from their dashboard.
- **Decision 3: Self-Contained Web Platform Admin Console**
  - *Chosen Approach*: Authenticate platform super-admins on the backend (seeded automatically for the primary owner email `asuracorps@gmail.com` and configurable via `CAREFLOW_SUPER_ADMIN_EMAILS` or the `is_platform_admin` column on `users`) and expose protected `/api/platform-admin/*` routes.
  - *Why*: Lets you manage every tenant, user, rate limit, database record, and Telegram webhook directly in the browser without SSH or Wrangler CLI commands.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                  WEB & BOT INTERFACES                                 │
├────────────────────────┬────────────────────────┬───────────────────┬─────────────────┤
│  Role Registration &   │  Workspace Dashboards  │  Invitation View  │  Central        │
│  Legal Compliance      │  • Business Command Ctr│  • /invite/[token]│  Platform Admin │
│  • Business vs. Agent  │  • Agent Support Desk  │  • Business-Mgd   │  • Businesses   │
│  • /privacy, /terms    │  • Cross-Role Switcher │    or Personal    │  • Users/Agents │
│  • /compliance         │  • Leave / Create Org  │    Account Link   │  • TG Webhooks  │
└───────────┬────────────┴───────────┬────────────┴─────────┬─────────┴────────┬────────┘
            │                        │                      │                  │
            ▼                        ▼                      ▼                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND API & AUTHORIZATION GUARD LAYER                        │
│  • Session & Active Membership Verifier (blocks suspended/revoked/departed instantly) │
│  • Role & Granular Permission Guard (Owner / Admin / Supervisor / Agent / Viewer)     │
│  • Platform Super-Admin Guard (/api/platform-admin/*)                                 │
└───────────┬────────────────────────┬──────────────────────┬──────────────────┬────────┘
            │                        │                      │                  │
            ▼                        ▼                      ▼                  ▼
┌────────────────────────┐ ┌──────────────────────┐ ┌─────────────────┐ ┌───────────────┐
│  Registration & Role   │ │ Identity & Invite Svc│ │ Session & Audit │ │ Platform Ops  │
│  Expansion Service     │ │ • agent_identities   │ │ Security Engine │ │ & TG Sync Svc │
│  • Agent-Only Sign Up  │ │ • Single-Use Invites │ │ • Per-Org Revoke│ │ • Webhook Sync│
│  • Business Sign Up    │ │ • Consent Linking    │ │ • Auto-Unassign │ │ • Tenant Mgmt │
│  • Cross-Role Upgrade  │ │ • Suspend / Revoke   │ │   on Departure  │ │ • Rate Reset  │
└───────────┬────────────┘ └─────────┬────────────┘ └───────┬─────────┘ └──────┬────────┘
            │                        │                      │                  │
            └────────────────────────┴──────────┬───────────┴──────────────────┘
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                          CLOUDFLARE D1 / SQLITE DATA LAYER                            │
│  • users (with is_platform_admin, account_type)  • organizations & portal_settings    │
│  • agent_identities (business-managed + linked)  • organization_members (status,perm) │
│  • workspace_invitations (SHA-256 token_hash)    • auth_sessions & audit_logs         │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Extensions

1. **`users` Extensions**:
   - Add `account_type TEXT NOT NULL DEFAULT 'business' CHECK (account_type IN ('business', 'agent', 'both'))` and `is_platform_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_admin IN (0, 1))`.
   - Automatically mark the platform owner account (`asuracorps@gmail.com` or emails in `CAREFLOW_SUPER_ADMIN_EMAILS`) with `is_platform_admin = 1`.
2. **`agent_identities` Table**:
   - Stores `id`, `email`, `display_name`, `password_hash`, `user_id` (nullable FK to `users.id`), `email_verified`, `department`, `created_at`, `updated_at`.
   - Enables Business-Managed Agents (`user_id = NULL`) to authenticate and work inside their assigned workspace without a personal `users` record, and supports explicit-consent linking (`user_id = users.id`) when connecting to a personal CustomCare account.
3. **`organization_members` Extensions**:
   - Add `agent_identity_id`, `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'departed'))`, `department`, `permissions_json`, `invited_by_user_id`, `suspended_at`, `revoked_at`, `departed_at`.
4. **`workspace_invitations` Table**:
   - Stores `id`, `organization_id`, `email`, `display_name`, `role`, `department`, `permissions_json`, `token_hash` (SHA-256), `invited_by_user_id`, `status IN ('pending', 'accepted', 'revoked', 'expired')`, `expires_at`, `accepted_at`, `revoked_at`, `created_at`.
5. **`workspace_audit_logs` Table**:
   - Records all membership, invitation, role-change, identity-linking, and platform-admin operations (`id`, `organization_id`, `actor_user_id`, `actor_email`, `action`, `target_type`, `target_id`, `metadata_json`, `ip_address`, `created_at`).

### Interactive Component & State Mapping

- **Brand Logo & Favicon Component (`CustomCareBrandMark`)**:
  - Renders the official `.CUSTOMCARE` icon mark and lockups across the navigation bar, login/registration screens, onboarding header, customer portal footer, and HTML `<head>` metadata (`icon`, `shortcut icon`, `apple-touch-icon`, `og:image`).
- **Role-Based Registration & Cross-Role Dashboard Switcher**:
  - Registration form toggles between **Business Registration** (includes Business Name, Industry, Country, Website) and **Agent Registration** (Name, Email, Password, Primary Specialty, plus optional Invitation Code).
  - Inside the dashboard, users with 0 active workspaces (newly registered standalone agents) see the **Agent Workspace Hub** where they can paste an invitation token, accept pending email invitations, or click **"Create a Business Workspace"**.
  - Existing Business Owners can click **"Accept Agent Invitation"** in their workspace switcher or `Account & Security` tab to join another business as an agent, and existing Agents can click **"Create a Business Workspace"** to become a Business Owner.
- **Team Invitations, Identity Linking & Lifecycle Controls**:
  - Admins create, resend, and revoke invitations in **Team & Specialists**, and manage member statuses (**Suspend**, **Reactivate**, **Revoke**).
  - `/invite/[token]` lets invited agents accept as a **Business-Managed Agent** or link to a **Personal CustomCare Account** with explicit consent.
  - Agents can click **Leave Workspace**, which marks their membership `departed`, unassigns their open conversations in that workspace, and revokes their workspace session.
- **Central CustomCare Platform Admin Dashboard (`/platform-admin`)**:
  - Full-screen management console for platform super-admins with live search, tenant status toggles, user/agent inspection, rate-limit reset, session revocation, and 1-click Telegram webhook/command synchronization.
- **Legal & Compliance Pages (`/privacy`, `/terms`, `/compliance`)**:
  - Accessible from every public and authenticated footer, registration form, and support portal.
