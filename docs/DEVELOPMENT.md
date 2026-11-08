# CustomCare Development & Deployment Guide (`v0.2.0`)

## 1. Prerequisites

- **Node.js:** `>= 22.0.0` (includes built-in `node:sqlite` for zero-dependency local D1 emulation)
- **Package Manager:** `pnpm >= 9.x` or `npm`
- **Wrangler CLI:** `>= 4.x` (installed in `devDependencies`)

---

## 2. Installation

Clone the repository from GitHub and install all workspace dependencies from the monorepo root:

```bash
git clone https://github.com/crazyBuddhaa/careflow.git
cd careflow
pnpm install
```

---

## 3. Environment Configuration

Copy the root `.env.example` template to `.env.local`:

```bash
cp .env.example .env.local
```

### Environment Variables Reference

| Variable | Exposure | Required | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Public | No | Defaults to `CustomCare`. |
| `NEXT_PUBLIC_APP_URL` | Public | No | Canonical base URL (`https://getcustomcare.xyz`). |
| `CAREFLOW_ADMIN_SESSION_SECRET` | **Server-Only** | Production | Secret key (`>= 32` chars) for session signing. |
| `CAREFLOW_INTEGRATION_ENCRYPTION_KEY` | **Server-Only** | Production | AES-256-GCM secret key for encrypting bot tokens, claim login info, and replacement stock credentials. |
| `CAREFLOW_SUPER_ADMIN_EMAILS` | **Server-Only** | Optional | Comma-separated emails granted Central Platform Super-Admin access alongside role account `admin@getcustomcare.xyz`. |
| `TELEGRAM_BOT_TOKEN` | **Server-Only** | Optional | Central `@getcustomcarebot` Telegram bot token. |
| `TELEGRAM_WEBHOOK_SECRET` | **Server-Only** | Optional | Secret token header verifying Telegram webhook requests. |
| `RESEND_API_KEY` | **Server-Only** | Optional | Resend API key for transactional email delivery. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public | Optional | Cloudflare Turnstile site key for bot defense. |
| `TURNSTILE_SECRET_KEY` | **Server-Only** | Optional | Cloudflare Turnstile server-side verification key. |

---

## 4. Local Development & Verification Commands

Run commands from the repository root:

```bash
# Start Next.js 16 development server on http://localhost:3000
npm run dev

# Run strict TypeScript typechecking across all apps and packages
npm run lint

# Run all automated unit, integration & E2E test suites
npm test

# Build production Next.js bundle
npm run build
```

---

## 5. Cloudflare D1 Database Migrations (`0001` – `0008`)

All SQL migrations live in `/cloudflare/d1/migrations/`:
1. `0001_business_knowledge_management.sql`
2. `0002_portal_settings_and_operations.sql`
3. `0003_authentication_identity_and_mfa.sql`
4. `0004_tenant_isolation_and_query_optimization.sql`
5. `0005_multichannel_unified_support_os.sql`
6. `0006_telegram_customer_experience_and_attachments.sql`
7. `0007_agent_identities_invitations_and_platform_admin.sql`
8. `0008_qa_automation_feedback_and_backlog.sql`

To apply migrations to local or remote Cloudflare D1 (`customcare-db`):

```bash
# Apply to local Wrangler D1 state
npx wrangler d1 migrations apply customcare-db --local

# Apply to remote production Cloudflare D1 database
npx wrangler d1 migrations apply customcare-db --remote
```

---

## 6. Deployment Guide (Cloudflare Workers + OpenNext + D1)

CustomCare deploys to **Cloudflare Workers** (`@opennextjs/cloudflare` + root `wrangler.jsonc`) bound to **Cloudflare D1** (`DB` -> `customcare-db`):

```bash
# Automated D1 migration + OpenNext bundle build + Worker deployment
npm run cf:setup
```
