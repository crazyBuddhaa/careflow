# CareFlow REST API Specification (`v0.1.0`)

## 1. Design Conventions

CareFlow exposes JSON endpoints implemented via **Next.js App Router Route Handlers** (`apps/web/src/app/api/**/route.ts`), structured cleanly for portability to Cloudflare Workers:

1. **Transport, Auth & Validation Layer (`route.ts`, `admin-auth.ts`, `@careflow/validation`):** Verifies HMAC-signed `HttpOnly` admin session cookies (`cf_admin_session`) and validates request bodies/queries with Zod schemas.
2. **Domain & Authorization Layer (`@careflow/support-engine`):** `KnowledgeManagementService` enforces `UserRole.Admin` RBAC, slug uniqueness, keyword indexing, and cross-tenant category ownership checks independent of HTTP frameworks.
3. **Persistence Layer (`@careflow/database/d1`):** `D1KnowledgeRepository` executes parameterized SQLite/D1 queries scoped strictly by server-verified `organizationId`.

All responses conform to `ApiResponse<T>` (`{ ok: true, data, meta }` or `{ ok: false, error }`).

---

## 2. Stage 1 — Business Knowledge Management Admin Endpoints

> **Tenant Isolation Rule:** None of the `/api/admin/knowledge/*` endpoints accept `organizationId` from the browser. Every query and mutation uses `session.organizationId` resolved on the server from the verified `cf_admin_session` cookie.

### `GET /api/admin/session`
Returns the active administrator session (`authenticated: boolean`, `session`, and available workspace options).

### `POST /api/admin/session`
Authenticates a business administrator for a selected workspace (`organizationId` + `accessPasscode`) and sets an `HttpOnly`, `SameSite=Lax`, HMAC-SHA256 signed session cookie.
- `200 OK` — Session established.
- `401 Unauthorized` — Invalid administrator passcode.
- `422 Unprocessable Entity` — Failed schema validation.

### `DELETE /api/admin/session`
Clears the `cf_admin_session` cookie and signs out the administrator.

### `GET /api/admin/knowledge/overview`
Returns category, article (`total`, `published`, `draft`, `archived`), and FAQ (`total`, `published`, `draft`, `archived`) counts for the authenticated business.

### `GET /api/admin/knowledge/categories` | `POST /api/admin/knowledge/categories`
Lists categories ordered by `displayOrder` or creates a new category (`name`, `slug`, `description`, `displayOrder`) for the authenticated business.

### `PATCH /api/admin/knowledge/categories/[categoryId]` | `DELETE /api/admin/knowledge/categories/[categoryId]`
Updates or deletes a category owned by the authenticated business. Deleting a category preserves its articles and FAQs with `categoryId = null`.

### `GET /api/admin/knowledge/articles` | `POST /api/admin/knowledge/articles`
- `GET` supports `?query=`, `?categoryId=`, and `?status=draft|published|archived`.
- `POST` creates a new article (`title`, `slug?`, `shortDescription`, `content`, `categoryId`, `tags`, `status`).

### `GET /api/admin/knowledge/articles/[articleId]` | `PATCH /api/admin/knowledge/articles/[articleId]` | `DELETE /api/admin/knowledge/articles/[articleId]`
Fetches full article content, updates fields or `status` (`draft`, `published`, `archived`), or deletes an article within the authenticated business.

### `GET /api/admin/knowledge/faqs` | `POST /api/admin/knowledge/faqs`
- `GET` supports `?search=`, `?categoryId=`, and `?status=draft|published|archived`.
- `POST` creates a new FAQ (`question`, `answer`, `categoryId`, `status`, `displayOrder`).

### `PATCH /api/admin/knowledge/faqs/[faqId]` | `DELETE /api/admin/knowledge/faqs/[faqId]`
Updates question/answer/category/status or deletes an FAQ within the authenticated business.

---

## 3. Platform Public Endpoints

- **`GET /api/health`** — Runtime health, environment validation, and module readiness status.
- **`POST /api/enquiries`** — Validates business onboarding enquiries submitted from `/onboarding`.
