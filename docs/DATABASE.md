# CustomCare (`@careflow`) Database Architecture (`v0.2.0` — Cloudflare D1)

## 1. Persistence Architecture: Cloudflare D1 (SQLite)

CustomCare's primary persistence layer is **Cloudflare D1 (SQLite)** accessed through repository interfaces in `@careflow/support-engine` and `@careflow/database/d1`:

- **Cloudflare Workers Production Runtime:** Binds directly to a Cloudflare D1 database (`env.DB`, `customcare-db`) implementing `D1DatabaseLike`.
- **Local & Node.js Server Runtime:** Uses `NodeSqliteD1Adapter` (`packages/database/src/sqlite-node.ts`) backed by Node 22's built-in `node:sqlite` (`DatabaseSync` with `WAL` mode and `PRAGMA foreign_keys = ON`) persisting to `.careflow-data/careflow-knowledge.sqlite` (configurable via `CAREFLOW_SQLITE_PATH`).
- **Client-Safe Preset Exports:** `@careflow/database/d1-portal-presets` exports portal template definitions without pulling in server-only Node modules (`node:crypto`).

---

## 2. Directory Layout & D1 Migrations

```text
cloudflare/
  d1/
    migrations/
      0001_business_knowledge_management.sql    # Organizations, categories, articles, FAQs
      0002_multi_business_onboarding.sql        # Users, sessions, memberships, portal branding
      0003_security_auth_2fa_audit.sql          # Email verification, TOTP 2FA, security logs, rate limits
      0004_multichannel_support_os.sql          # Channels, Telegram bots, conversations, messages, tickets, attachments
      0005_agent_invitations_and_roles.sql      # Staff invitations, RBAC role updates
      0006_operations_claims_inventory_analytics.sql # Complaints, claim status history, inventory, targets
      0007_multi_tier_complaint_routing.sql     # Multi-tier escalation & specialized personnel routing
      0008_qa_automation_feedback_and_backlog.sql # QA evaluations, automation rules, CSAT ratings
packages/
  database/
    src/
      d1.ts                                     # Edge/Workers-safe D1 services & repositories
      d1-portal-presets.ts                      # Client-safe portal branding presets
      d1-types.ts                               # Portable D1DatabaseLike interface & schema SQL
      d1-bootstrap.ts                           # Edge/Workers-safe D1 schema & starter workspace bootstrap
      d1-knowledge-repository.ts                # Tenant-isolated Knowledge repository
      d1-workspace-repository.ts                # Multi-tenant organization & onboarding repository
      d1-auth-service.ts                        # Auth, TOTP 2FA, staff invitation & RBAC service
      d1-channel-service.ts                     # Unified inbox, portal, widget & Telegram service
      d1-operations-service.ts                  # Complaints, inventory, QA, automation, CSAT & analytics service
      sqlite-node.ts                            # Local Node.js built-in SQLite adapter
```

---

## 3. Attachment & Evidence Storage

- Customer portal, website widget, and Telegram attachments are stored in the `attachments` table (`0004_multichannel_support_os.sql`) with structured metadata (`file_name`, `mime_type`, `size_bytes`, `storage_key`, `public_url`, `telegram_file_id`).
- Structured complaint evidence and proof references are stored inline in `complaint_records.evidence_json` (`0006_operations_claims_inventory_analytics.sql`).

---

## 4. Multi-Business Isolation Rules

- Every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` query across all D1 repositories binds `organization_id = ?` using the server-verified session or channel token identity.
- Category assignments, ticket workflows, QA evaluations, and CSAT ratings verify tenant ownership prior to write.
- Published knowledge retrieval (`retrievePublishedKnowledge`) queries strictly `WHERE organization_id = ? AND status = 'published'`.
