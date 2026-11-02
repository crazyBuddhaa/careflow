# CareFlow Database Architecture (`v0.1.0` — Stage 1 Cloudflare D1)

## 1. Strategic Direction: Cloudflare D1 (SQLite)

CareFlow's primary persistence target is **Cloudflare D1 (SQLite)** accessed through repository interfaces in `@careflow/support-engine` and `@careflow/database/d1`:

- **Cloudflare Workers / Pages Production Runtime:** Binds directly to a Cloudflare D1 database (`env.DB`) implementing `D1DatabaseLike`.
- **Local & Node.js Server Runtime:** Uses `NodeSqliteD1Adapter` (`packages/database/src/sqlite-d1-adapter.ts`) backed by Node 22's built-in `node:sqlite` (`DatabaseSync` with `WAL` mode and `PRAGMA foreign_keys = ON`) persisting to `.careflow-data/careflow-knowledge.sqlite` (configurable via `CAREFLOW_SQLITE_PATH`).
- **Legacy Foundation Files Preserved:** Initial `supabase/` SQL files and `@careflow/database/client` / `@careflow/database/server` adapters remain intact so existing health checks and references continue compiling without breaking changes.

---

## 2. Directory Layout

```text
cloudflare/
  d1/
    migrations/
      0001_business_knowledge_management.sql    # Stage 1 D1 SQLite schema & indexes
packages/
  database/
    src/
      d1.ts                                     # Edge/Workers-safe D1 Knowledge Repository entrypoint
      d1-types.ts                               # Portable D1DatabaseLike interface & schema SQL
      d1-bootstrap.ts                           # Edge/Workers-safe D1 schema & starter workspace bootstrap
      d1-knowledge-repository.ts                # Tenant-isolated SQL repository
      sqlite-node.ts                            # Local Node.js built-in SQLite adapter
      sqlite-d1-adapter.ts                      # Backwards-compatible Node/D1 re-export
```

---

## 3. Stage 1 Knowledge Management Schema (`0001_business_knowledge_management.sql`)

1. **`organizations`** — Multi-business tenant root (`id`, `slug`, `name`, `is_active`, `created_at`, `updated_at`).
2. **`knowledge_categories`** — Per-business configurable categories (`id`, `organization_id`, `slug`, `name`, `description`, `display_order`, `created_at`, `updated_at`), with `UNIQUE (organization_id, slug)`.
3. **`knowledge_articles`** — Structured business knowledge (`id`, `organization_id`, `category_id`, `slug`, `title`, `short_description`, `content`, `tags_json`, `status`, `search_keywords`, `created_at`, `updated_at`), enforcing `status IN ('draft', 'published', 'archived')` and `ON DELETE SET NULL` when a category is deleted.
4. **`knowledge_faqs`** — Approved question-and-answer records (`id`, `organization_id`, `category_id`, `question`, `answer`, `status`, `search_keywords`, `display_order`, `created_at`, `updated_at`), enforcing `status IN ('draft', 'published', 'archived')`.

### Composite Tenant Indexes
- `idx_knowledge_categories_org_order (organization_id, display_order, name)`
- `idx_knowledge_articles_org_status_updated (organization_id, status, updated_at DESC)`
- `idx_knowledge_articles_org_category (organization_id, category_id)`
- `idx_knowledge_faqs_org_status_order (organization_id, status, display_order, updated_at DESC)`
- `idx_knowledge_faqs_org_category (organization_id, category_id)`

---

## 4. Multi-Business Isolation Rules

- Every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` query in `D1KnowledgeRepository` binds `organization_id = ?` using the server-verified admin session identity.
- Category assignments on articles and FAQs verify that `category_id` belongs to the exact same `organization_id` prior to write.
- Future chatbot retrieval (`retrievePublishedKnowledge`) queries strictly `WHERE organization_id = ? AND status = 'published'`.
