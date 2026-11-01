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
git clone https://github.com/<your-org>/careflow.git
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

## 6. Deployment Preparation (GitHub + Vercel + Supabase)

CareFlow is pre-configured for zero-lock-in deployment to **Vercel** and **Supabase**:

1. **GitHub Repository:** Push the monorepo to GitHub (`main` for production, feature branches for preview deployments).
2. **Supabase Project:**
   - Provision a new Supabase PostgreSQL project.
   - Apply SQL migrations (`supabase link --project-ref <ref> && supabase db push`).
3. **Vercel Project Connection:**
   - Import the GitHub repository in Vercel.
   - `vercel.json` at the repository root automatically configures `pnpm install`, `pnpm --filter @careflow/web build`, and `apps/web/.next` output routing (or set Vercel **Root Directory** to `apps/web`).
   - Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_APP_URL` inside **Vercel Project Settings → Environment Variables**.
4. **Post-Deploy Verification:**
   - Visit `https://<your-domain>/api/health` and confirm `"status": "operational"` and `"publicClientConfigured": true`.
