# CareFlow Development & Deployment Guide

## 1. Prerequisites

- **Node.js:** `>= 20.0.0`
- **Package Manager:** `pnpm >= 9.x` (configured via `pnpm-workspace.yaml` and `packageManager` in `package.json`)
- **Supabase CLI (optional for local DB):** `>= 1.200.0`
- **Git:** For GitHub source control and Vercel CI/CD integration

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

Copy the root `.env.example` template to `apps/web/.env.local` (or root `.env.local`):

```bash
cp .env.example apps/web/.env.local
```

### Environment Variables Reference

| Variable | Exposure | Required | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Public | No | Defaults to `CareFlow`. |
| `NEXT_PUBLIC_APP_URL` | Public | No | Canonical base URL (defaults to `http://localhost:3000`). |
| `NEXT_PUBLIC_INITIAL_CLIENT` | Public | No | Initial client identifier (`UltimateTechApp`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | For DB/Auth | Project URL from Supabase Settings → API. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | For DB/Auth | Public anonymous key enforced by PostgreSQL RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-Only** | For Admin/Webhooks | Secret service-role key. **Never prefix with `NEXT_PUBLIC_`.** |
| `DATABASE_URL` | **Server-Only** | Migrations only | Direct PostgreSQL URI used for CLI migrations. |
| `TELEGRAM_BOT_TOKEN` | **Server-Only** | Reserved (v0.2+) | Bot token for future Telegram channel adapter. |
| `TELEGRAM_WEBHOOK_SECRET` | **Server-Only** | Reserved (v0.2+) | Secret header token verifying Telegram webhook origin. |

All variables are validated at runtime via `@careflow/validation` (`packages/validation/src/env.ts`). Placeholder values from `.env.example` are automatically treated as unconfigured so local UI and `/api/health` checks run cleanly before connecting a live Supabase project.

---

## 4. Local Development Commands

Run commands from the repository root:

```bash
# Start Next.js development server on http://localhost:3000
pnpm dev

# Run strict TypeScript typechecking across all apps and packages
pnpm typecheck

# Build production Next.js bundle
pnpm build

# Start compiled production server locally
pnpm start
```

---

## 5. Database Migrations & Seed Workflow

1. Start local Supabase stack (Docker required):
   ```bash
   supabase start
   ```
2. Apply `supabase/migrations/20261101000000_foundation_architecture.sql` and seed `UltimateTechApp` (`supabase/seed.sql/001_initial_seed.sql`):
   ```bash
   supabase db reset
   ```
3. Copy the local `API URL`, `anon key`, and `service_role key` printed by `supabase status` into `apps/web/.env.local`.

---

## 6. Deployment Guide (Cloudflare Workers + D1 + GitHub)

CareFlow is pre-configured for **Cloudflare Workers** (`@opennextjs/cloudflare` + `wrangler.jsonc` at the monorepo root) and **Cloudflare D1**:

### A. Automatic GitHub Deployments via Cloudflare Workers Builds
1. Connect the GitHub repository in **Cloudflare Dashboard → Workers & Pages → Create → Workers → Connect to Git**.
2. Keep the default repository root settings:
   - **Root directory:** `/`
   - **Build command:** `bun run build` (or `npm run cf:build`)
   - **Deploy command:** `npx wrangler deploy`
   - Root `wrangler.jsonc` targets `apps/web/.open-next/worker.js` and `apps/web/.open-next/assets`, avoiding monorepo auto-detection errors.

### B. Provisioning & Binding Cloudflare D1 (Stage 1 Knowledge Persistence)
1. Create a D1 database (via CLI or Cloudflare Dashboard → Storage & Databases → D1):
   ```bash
   npx wrangler d1 create careflow-db
   ```
2. Bind the D1 database to the `careflow` Worker with variable name **`DB`**:
   - **Option 1 (Cloudflare Dashboard — zero code edit):** Go to **Workers & Pages → careflow → Settings → Bindings → Add → D1 database**, set Variable name to `DB`, and select `careflow-db`.
   - **Option 2 (`wrangler.jsonc`):** Uncomment the `d1_databases` block in `/wrangler.jsonc` and paste your `database_id`.
3. *(Optional)* Run SQL migrations explicitly (`cloudflare/d1/migrations/0001_business_knowledge_management.sql`):
   ```bash
   npx wrangler d1 migrations apply careflow-db --remote
   ```
   *(CareFlow also automatically initializes any missing D1 tables and base workspaces on first request.)*

### C. Production Secrets (Admin Workspace Sign-In)
In **Workers & Pages → careflow → Settings → Variables and Secrets** (or via `npx wrangler secret put`), add:
- `CAREFLOW_ADMIN_SESSION_SECRET` — random secret string (`>= 16` characters, `32+` recommended)
- `CAREFLOW_ADMIN_PASSCODE` — strong workspace administrator passcode

### D. Post-Deploy Verification
- Visit `https://<your-worker>.workers.dev/` for the central CareFlow website.
- Visit `https://<your-worker>.workers.dev/portal/ultimatetechapp` for the business support portal.
- Visit `https://<your-worker>.workers.dev/admin` to sign in and manage business knowledge in Cloudflare D1.
- Visit `https://<your-worker>.workers.dev/api/health` to verify runtime health.
