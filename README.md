# CustomCare (`getcustomcare.xyz`)

**Smarter Support. Better Experiences.**  
**Version:** `0.2.0` | **Runtime:** `Next.js 16.4.3 + Cloudflare Workers + Cloudflare D1 (SQLite)`

CustomCare is a multi-tenant, multi-channel customer support, claims verification, replacement inventory, and workforce operations platform built on Next.js 16 (App Router) and Cloudflare D1 (`SQLite`).

---

## Monorepo Structure

```text
careflow/
  apps/
    web/                 # Next.js 16 (App Router) web application, portals, workspaces & API Route Handlers
    widget/              # Embeddable customer support widget SDK targeting /api/widget/[publicToken]
  packages/
    database/            # Cloudflare D1 / Node SQLite repositories, auth, channels, claims, inventory & analytics
    shared/              # Canonical TypeScript domain types, enums, API contracts, and platform constants
    validation/          # Zod schemas for environment variables and REST API payloads
    support-engine/      # Portable domain services for conversations, troubleshooting, and channel routing
  cloudflare/
    d1/migrations/       # Sequential Cloudflare D1 (SQLite) migrations (0001 through 0008)
  docs/
    PLATFORM_AUDIT_AND_ROADMAP.md        # 20-Point Repository Audit Matrix, Health Report & Backlog
    COMMERCIAL_AND_TECHNICAL_HANDBOOK.md # 12-Part Technical, Operational & Commercial Readiness Suite
    ARCHITECTURE.md                      # 6-Module System Architecture & Multi-Tenant Isolation Blueprint
    DATABASE.md                          # Cloudflare D1 Schema, Triggers, and AES-256-GCM Credential Vault
    API.md                               # REST API Route Handlers, Envelope Convention, and Zod Validation
    DEVELOPMENT.md                       # Local Development Workflow & Cloudflare Workers + D1 Deployment Guide
  .env.example           # Environment variables template
  pnpm-workspace.yaml    # Monorepo workspace declaration
  wrangler.jsonc         # Cloudflare Workers + OpenNext + D1 deployment configuration
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
   Local development automatically uses Node's built-in `node:sqlite` (`DatabaseSync`) with zero external database setup required, and automatically runs all D1 schema bootstrap statements on first request.
3. **Start the development server**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` to view the CustomCare application or inspect `http://localhost:3000/api/health`.
4. **Run automated test suites & typecheck**
   ```bash
   npm test
   npm run lint
   ```

---

## Documentation

- [Comprehensive Platform Audit & Roadmap](./docs/PLATFORM_AUDIT_AND_ROADMAP.md)
- [Commercial & Technical Readiness Handbook](./docs/COMMERCIAL_AND_TECHNICAL_HANDBOOK.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Database & Tenant Isolation](./docs/DATABASE.md)
- [REST API Specification](./docs/API.md)
- [Development & Deployment Guide](./docs/DEVELOPMENT.md)
