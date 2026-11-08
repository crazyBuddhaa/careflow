# CustomCare (`@careflow`) REST API Specification (`v0.2.0`)

## 1. Design Conventions

CustomCare exposes JSON endpoints implemented via **Next.js 16 App Router Route Handlers** (`apps/web/src/app/api/**/route.ts`), running on Cloudflare Workers + D1 (`customcare-db`):

1. **Transport, Auth & Validation Layer (`route.ts`, `admin-auth.ts`, `@careflow/validation`):** Verifies HMAC-signed `HttpOnly` session cookies (`cf_user_session`, `cf_admin_session`) and validates request bodies/queries with Zod schemas.
2. **Domain & Authorization Layer (`@careflow/support-engine`, `@careflow/database/d1`):** Enforces RBAC (`owner`, `admin`, `supervisor`, `agent`, `specialized_personnel`) and tenant isolation.
3. **Persistence Layer (`@careflow/database/d1`):** Executes parameterized SQLite/D1 queries scoped strictly by server-verified `organizationId`.

All responses conform to `ApiResponse<T>` (`{ ok: true, data, meta }` or `{ ok: false, error }`) with `meta.version = "0.2.0"`.

---

## 2. Authentication, Security & Workspace Onboarding

- **`POST /api/auth/register`** — Registers a new business owner account and initializes email verification.
- **`POST /api/auth/login`** — Authenticates user credentials (`email`, `password`, optional `totpCode` / `recoveryCode`). Mandatory 2FA setup applies strictly to registered platform super-admins (`CAREFLOW_SUPER_ADMIN_EMAILS`).
- **`POST /api/auth/logout`** — Revokes active session and clears auth cookies.
- **`GET /api/auth/me`** — Returns current user, active workspace membership, and workspaces list.
- **`POST /api/auth/verify-email`** — Verifies email address or resends OTP code.
- **`GET /api/auth/2fa` | `POST /api/auth/2fa`** — Generates TOTP secret, enables/disables 2FA, or regenerates recovery codes.
- **`GET /api/auth/security` | `POST /api/auth/security`** — Lists active device sessions, security audit events, and revokes sessions.
- **`GET /api/onboarding/workspace` | `POST /api/onboarding/workspace` | `PATCH /api/onboarding/workspace`** — Multi-step workspace onboarding, portal branding configuration, and custom hostname management.
- **`GET /api/admin/team` | `POST /api/admin/team` | `PATCH /api/admin/team` | `DELETE /api/admin/team`** — Staff invitations, role updates, and member revocation.
- **`GET /api/invitations/[token]` | `POST /api/invitations/[token]`** — Previews and accepts a staff invitation token.

---

## 3. Customer Support Channels (Portal, Widget & Telegram)

- **`GET /api/portal/[slug]/support` | `POST /api/portal/[slug]/support`**
  - `GET`: Searches published knowledge articles/FAQs (`?q=`), fetches public complaint status (`?caseReference=`), or loads portal configuration.
  - `POST`: Supports `action: 'guided' | 'escalate' | 'file_complaint' | 'submit_feedback'`.
- **`OPTIONS /api/widget/[publicToken]` | `GET /api/widget/[publicToken]` | `POST /api/widget/[publicToken]`**
  - Validates the request `Origin` header against the widget's `allowedOrigins`, the organization's website, verified custom hostnames, and platform domains (`403 ORIGIN_NOT_ALLOWED` on unauthorized origins).
  - `GET`: Bootstraps widget branding, starter prompts, and published FAQs.
  - `POST`: Runs guided troubleshooting (`action: 'troubleshoot'`) or escalates to a human agent (`action: 'escalate'`).
- **`POST /api/telegram/webhook/[botPublicId]`** — Verifies `x-telegram-bot-api-secret-token` and processes Telegram commands (`/start`, `/help`, `/human`, `/status`), inline keyboards, and attachments.
- **`GET /api/telegram/miniapp/[botPublicId]` | `POST /api/telegram/miniapp/[botPublicId]`** — Verifies HMAC-SHA256 `initData` (or dev customer identity) and powers the Telegram Mini App knowledge search, guided troubleshooting, and human escalation.

---

## 4. Unified Inbox, Operations, QA, Automation & Analytics

- **`GET /api/admin/inbox` | `POST /api/admin/inbox` | `PATCH /api/admin/inbox`** — Lists unified multi-channel conversations, sends agent replies or internal notes, assigns agents, updates conversation status/priority, and generates AI-assisted reply drafts grounded in published knowledge.
- **`GET /api/admin/operations/complaints` | `POST /api/admin/operations/complaints` | `PATCH /api/admin/operations/complaints`** — Lists, logs, assigns, escalates (`CUSTOMER → AGENT → SUPERVISOR → SPECIALISED PERSONNEL → RESOLUTION`), and resolves structured complaint claims.
- **`GET /api/admin/operations/inventory` | `POST /api/admin/operations/inventory` | `PATCH /api/admin/operations/inventory`** — Manages replacement stock and inventory movements.
- **`GET /api/admin/operations/dashboard` | `POST /api/admin/operations/dashboard`**
  - `GET`: Returns daily/weekly/monthly operational analytics, backlog aging matrix, agent scorecards (with `null` metrics for inactive agents and strict per-agent CSAT attribution), QA reviews, automation rules, and CSV exports (`?export=claims_csv|scorecards_csv`).
  - `POST`: Dispatches operational mutations by `action`:
    - `action: 'upsert_target'` — Saves agent/team SLA & resolution targets.
    - `action: 'create_qa_review'` — Records supervisor quality assurance evaluations and coaching notes.
    - `action: 'upsert_automation_rule'` — Creates or updates SLA/triage/routing workflow automation rules.
    - `action: 'delete_automation_rule'` — Deletes a workflow automation rule.
    - `action: 'submit_feedback'` — Records customer CSAT ratings (`1`–`5`).

---

## 5. Platform Super-Admin & Health

- **`GET /api/platform-admin` | `POST /api/platform-admin`** — Central platform super-admin overview (organizations, users, tickets) and account management, restricted to emails in `CAREFLOW_SUPER_ADMIN_EMAILS` (default role account: `admin@getcustomcare.xyz`).
- **`GET /api/health`** — Runtime health, environment validation, and module readiness status (`v0.2.0`).
