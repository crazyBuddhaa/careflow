# CareFlow Architecture (`v0.1.0`)

## 1. Architectural Principles

CareFlow is structured as a **pnpm workspace monorepo** built around strict separation of concerns, vendor portability, and multi-channel convergence:

1. **Portability (Ports & Adapters):** Core domain rules and repository contracts live in `@careflow/support-engine` and `@careflow/shared` with zero hard dependencies on Vercel or Next.js internals. HTTP Route Handlers in `apps/web` act strictly as thin transport adapters.
2. **Validation Boundary:** Every external input—both runtime environment variables and incoming HTTP JSON payloads—passes through `@careflow/validation` (Zod) before touching domain services.
3. **Unified Multi-Channel Intake:** Both the Website Widget (`apps/widget`) and Telegram webhook adapter (`modules/telegram-integration`) target the shared `ChannelConversationGatewayPort` so conversations, messages, and escalations follow a single lifecycle regardless of origin channel.
4. **Defense-in-Depth Security:** Browser bundles only ever receive `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Privileged `SUPABASE_SERVICE_ROLE_KEY` clients throw immediately if imported into a browser runtime, and PostgreSQL Row Level Security (RLS) enforces tenant boundaries at the database engine level.

---

## 2. Workspace Dependency Graph

```text
apps/web  ──────┬──► @careflow/support-engine ──► @careflow/validation ──► @careflow/shared
                ├──► @careflow/database       ──► @careflow/validation ──► @careflow/shared
                └──► @careflow/shared

apps/widget ────┬──► @careflow/validation     ──► @careflow/shared
                └──► @careflow/shared
```

---

## 3. Core Domain Modules (`@careflow/support-engine`)

All nine core support modules are scaffolded with explicit TypeScript service ports in `packages/support-engine/src/modules/`:

| Module | Directory | Responsibility |
| :--- | :--- | :--- |
| **Authentication** | `authentication/` | Session identity contract and UI-independent `hasMinimumRole()` RBAC policy helper (`customer`, `agent`, `supervisor`, `admin`). |
| **Customer Management** | `customer-management/` | Multi-tenant customer profile lookup and external ID linking. |
| **Conversations** | `conversations/` | Lifecycle state machine (`open`, `troubleshooting`, `escalated`, `resolved`, `closed`) and `ChannelConversationGatewayPort`. |
| **Messages** | `messages/` | Ordered message ledger contract with attachment URL support. |
| **Knowledge Base** | `knowledge-base/` | Published product documentation search and canonical slug retrieval. |
| **Smart Troubleshooting** | `smart-troubleshooting/` | Deterministic decision-tree evaluation prior to human queue entry. |
| **Human Escalation** | `human-escalation/` | Escalation ticket creation carrying structured diagnostic context and priority tiers. |
| **Agent Management** | `agent-management/` | Specialist availability states and active conversation assignment. |
| **Telegram Integration** | `telegram-integration/` | Webhook signature verification and normalization into `NormalizedInboundChannelEnvelope`. |

---

## 4. Realtime & Storage Readiness

- **Supabase Realtime (`@careflow/database/realtime`):** Defines deterministic topic naming (`org:{orgId}:conversation:{convId}` and `org:{orgId}:agent-queue`) alongside `RealtimePublisherPort` so WebSocket subscriptions can be wired in v0.2 without coupling UI views to raw channel strings.
- **Supabase Storage (`@careflow/database/storage`):** Defines `StorageAdapterPort` for short-lived signed upload and download URLs against a private `support-attachments` bucket.
