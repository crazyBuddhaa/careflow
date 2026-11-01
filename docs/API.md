# CareFlow REST API Specification (`v0.1.0`)

## 1. Design Conventions

CareFlow exposes RESTful endpoints implemented via **Next.js App Router Route Handlers** (`apps/web/src/app/api/**/route.ts`).

To maintain architectural portability and clean separation of concerns, every endpoint adheres to a 3-layer pipeline:

1. **Transport & Validation Layer (`route.ts` + `@careflow/validation`):** Parses HTTP request headers/JSON and validates inputs with Zod schemas.
2. **Application Service Layer (`apps/web/src/services/*` & `@careflow/support-engine`):** Executes pure business orchestration independent of `NextRequest`/`NextResponse`.
3. **Persistence Adapter Layer (`@careflow/database`):** Executes parameterized queries through RLS-enforced Supabase clients.

---

## 2. Standard JSON Envelope

All API responses conform to `ApiResponse<T>` defined in `@careflow/shared`:

### Success Response
```json
{
  "ok": true,
  "data": {},
  "meta": {
    "version": "0.1.0",
    "timestamp": "2026-11-01T22:00:00.000Z"
  }
}
```

### Error Response
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Enter a valid work email address",
    "details": {
      "workEmail": ["Enter a valid work email address"]
    }
  }
}
```

---

## 3. Available Endpoints (`v0.1.0`)

### `GET /api/health`
Returns runtime health, environment validation status, Supabase client configuration readiness (without exposing secrets), and scaffolded support module status.

- **Cache Policy:** `Cache-Control: no-store, max-age=0`
- **Status Codes:**
  - `200 OK` — Environment schema valid and service operational.
  - `503 Service Unavailable` — Environment schema reported validation issues.

**Example Response (`200 OK`):**
```json
{
  "ok": true,
  "data": {
    "service": "CareFlow",
    "version": "0.1.0",
    "client": "UltimateTechApp",
    "status": "operational",
    "environment": "development",
    "architecture": {
      "hosting": "vercel-ready",
      "backend": "nextjs-route-handlers",
      "database": "supabase-postgresql",
      "realtime": "supabase-realtime-prepared",
      "channels": ["web_widget", "telegram", "portal"]
    },
    "supabase": {
      "publicClientConfigured": false,
      "serverRoleConfigured": false
    },
    "modules": [
      { "key": "authentication", "name": "Authentication & RBAC", "stage": "scaffolded" }
    ],
    "timestamp": "2026-11-01T22:00:00.000Z"
  },
  "meta": {
    "version": "0.1.0",
    "timestamp": "2026-11-01T22:00:00.000Z"
  }
}
```

---

### `POST /api/enquiries`
Validates deployment onboarding requests submitted from the CareFlow landing page using `DeploymentEnquirySchema` (`@careflow/validation`).

- **Request Body:**
  - `fullName` (`string`, 2–100 chars, required)
  - `workEmail` (`string`, valid email, required)
  - `organization` (`string`, 2–100 chars, required)
  - `primaryChannel` (`"web_widget" | "telegram" | "portal"`)
  - `monthlyTicketVolume` (`"under_1k" | "1k_10k" | "10k_50k" | "50k_plus"`)
  - `notes` (`string`, optional, max 1000 chars)
- **Status Codes:**
  - `201 Created` — Validated and issued a `CF-*` confirmation reference.
  - `400 Bad Request` — Malformed JSON payload.
  - `422 Unprocessable Entity` — Failed Zod schema validation.

---

## 4. Planned Channel Endpoints (`v0.2+`)

Both the embeddable Website Widget and Telegram bot webhook will converge on shared conversation handlers:
- `POST /api/v1/conversations` — Open or resume a conversation via `ChannelConversationGatewayPort`.
- `POST /api/v1/webhooks/telegram` — Verify `X-Telegram-Bot-Api-Secret-Token` and forward normalized envelopes to `ChannelConversationGatewayPort`.
