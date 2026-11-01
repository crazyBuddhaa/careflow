# CareFlow

**Smarter Support. Better Experiences.**  
**Version:** `0.1.0` | **Initial Client:** `UltimateTechApp`

CareFlow is a modular, portable customer support platform designed to reduce repetitive enquiries through deterministic self-service flows, centralize product knowledge, and streamline human escalation across web and messaging channels.

---

## Monorepo Structure

```text
careflow/
  apps/
    web/                 # Next.js (App Router) web application & REST Route Handlers
    widget/              # Embeddable customer support widget SDK scaffold
  packages/
    database/            # Supabase browser/server client factories, Realtime & Storage ports
    shared/              # Domain types, enums, API contracts, and platform constants
    validation/          # Zod schemas for environment variables and REST API payloads
    support-engine/      # Portable service interfaces for all 9 core support domain modules
  supabase/
    config.toml          # Local Supabase CLI project configuration
    migrations/          # Versioned PostgreSQL SQL migrations & RLS baseline
    seed.sql/            # Initial development seed scripts (UltimateTechApp tenant)
  docs/
    ARCHITECTURE.md      # Modular architecture, portability, channels, and security design
    DATABASE.md          # Supabase PostgreSQL setup, migrations, RLS, Realtime, and Storage
    API.md               # REST API Route Handlers, envelope convention, and Zod validation
    DEVELOPMENT.md       # Installation, environment configuration, local workflow, & Vercel deploy
  .env.example           # Required & optional environment variables template
  pnpm-workspace.yaml    # pnpm monorepo workspace declaration
  vercel.json            # Vercel monorepo build & routing configuration
```

---

## Quick Start

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Populate `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project settings.
3. **Start the development server**
   ```bash
   pnpm dev
   ```
   Open `http://localhost:3000` to view the CareFlow application or inspect `http://localhost:3000/api/health`.

---

## Documentation

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Database & Row Level Security](./docs/DATABASE.md)
- [REST API Specification](./docs/API.md)
- [Development & Deployment Guide](./docs/DEVELOPMENT.md)
