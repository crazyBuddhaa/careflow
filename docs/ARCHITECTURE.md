# CustomCare Architecture (`v2.0`)

## 1. Architectural Principles

CustomCare is structured as a **TypeScript workspace monorepo** built around strict multi-business isolation, Cloudflare-first portability, and unified multi-channel operations:

1. **Portability (Ports & Adapters):** Core domain rules, operational DTOs, and repository services live in `@careflow/database`, `@careflow/support-engine`, and `@careflow/shared`. HTTP Route Handlers in `apps/web` act strictly as thin transport adapters.
2. **Validation Boundary:** Every external input—both runtime environment variables and incoming HTTP JSON payloads—passes through `@careflow/validation` (Zod) before touching domain services.
3. **Unified Multi-Channel Intake:** Hosted Support Portals (`/portal/[businessSlug]`), the Embeddable Website Widget (`apps/widget` -> `/api/widget/[publicToken]`), the Central Telegram Bot (`@CustomCareBot`), Dedicated Business Sub-Bots, and the Telegram Mini App (`/tg-app`) all converge into the same `support_conversations`, `support_messages`, and `support_complaints` tables.
4. **Defense-in-Depth Multi-Tenant Security:**
   - Every tenant-scoped table requires `organization_id TEXT NOT NULL`.
   - SQLite/D1 triggers (`trg_support_messages_tenant_insert`, `trg_knowledge_articles_category_tenant_insert`, etc.) block cross-tenant foreign key references at the database engine level.
   - Sensitive credentials (Telegram bot tokens, customer-supplied complaint login credentials, and replacement inventory credentials) are encrypted at rest with **AES-256-GCM** and masked in all list queries, logs, and audit events.

---

## 2. Workspace Dependency Graph

```text
apps/web  ──────┬──► @careflow/database       ──► @careflow/validation ──► @careflow/shared
                ├──► @careflow/support-engine ──► @careflow/validation ──► @careflow/shared
                └──► @careflow/shared

apps/widget ────┬──► @careflow/validation     ──► @careflow/shared
                └──► @careflow/shared
```

---

## 3. Six Interconnected Operational Modules

| Module | Primary Services & Components | Responsibility |
| :--- | :--- | :--- |
| **A. Customer Support & Channels** | `D1ChannelService`, `SupportPortalLanding`, `PortalClaimsWidget`, `apps/widget` | Multi-channel intake (Portal, Web Widget, Telegram), KB search, guided troubleshooting, human escalation, complaint tracking, and CSAT ratings. |
| **B. Agent Workspace** | `WorkspaceOperationsManager`, `/api/workspace/conversations/[id]/copilot` | Unified inbox, real-time replies, internal notes, saved replies, grounded KB Copilot, and complaint creation. |
| **C. Supervisor Workspace** | `ClaimsAndSupervisorManager`, `D1OperationsManagementService` | 7 supervisor verification queues, credential reveal auditing, mandatory decision reasons, Specialised Personnel routing (`CUSTOMER → AGENT → SUPERVISOR → SPECIALISED PERSONNEL → RESOLUTION`), and QA reviews. |
| **D. Administrator Dashboard** | `BusinessAdminShell`, `WorkspaceSettingsManager`, `ReplacementInventoryManager` | Organization settings, branding, team invitations, SLA policies, encrypted replacement stock pools, and fulfilment method controls. |
| **E. Performance Management & QA** | `OperationsAnalyticsAndReportsManager`, `D1OperationsManagementService` | Meaningful agent action tracking, Daily/Weekly/Monthly Agent Scorecards, SLA compliance, workload/complexity weighting, and Supervisor QA Evaluations with coaching notes. |
| **F. Support Analytics, Backlog & Automation** | `OperationsAnalyticsAndReportsManager`, `D1OperationsManagementService` | Executive KPIs, Channel & Category analytics, Trend series, multi-dimensional Backlog filtering, Daily/Weekly/Monthly Closing Reports (CSV/Excel/Print), and Configurable Workflow Automation Engine. |
