# CareFlow Database & Supabase Architecture

## 1. Overview

CareFlow uses **Supabase PostgreSQL** managed via versioned SQL migrations in `supabase/migrations/`. Database access is encapsulated in `@careflow/database` with separate entrypoints for browser and server runtimes:

- **Browser Client (`@careflow/database/client`):** Uses `@supabase/ssr` `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Governed strictly by PostgreSQL Row Level Security (RLS).
- **Server Session Client (`@careflow/database/server`):** Uses `createServerClient` with a portable `CookieStoreAdapter` to propagate authenticated user JWTs in Next.js Route Handlers and Server Components while respecting RLS.
- **Service-Role Admin Client (`@careflow/database/server`):** Uses `SUPABASE_SERVICE_ROLE_KEY` with session persistence disabled and a strict `typeof window !== 'undefined'` runtime guard. Reserved exclusively for verified server-to-server tasks (such as signed Telegram webhooks).

---

## 2. Directory Layout

```text
supabase/
  config.toml                                           # Supabase local CLI configuration
  migrations/
    20261101000000_foundation_architecture.sql          # Extensions, triggers, tenant table, RLS baseline
  seed.sql/
    001_initial_seed.sql                                # Seeds initial client: UltimateTechApp
```

---

## 3. Foundational Migration (`v0.1.0`)

Per `v0.1.0` architectural scope, `20261101000000_foundation_architecture.sql` establishes the database foundation without premature production domain tables:

1. **`pgcrypto` Extension:** Enables cryptographically strong UUIDv4 generation (`gen_random_uuid()`).
2. **`public.set_updated_at()` Trigger:** Automatically maintains UTC `updated_at` timestamps across mutable tables.
3. **`public.organizations` Table:** Establishes the multi-tenant isolation root (seeded with `ultimatetechapp` / `UltimateTechApp`).
4. **`public.current_user_organization_id()` Helper:** Reads `app_metadata.organization_id` from the verified Supabase Auth JWT claim for clean, index-friendly RLS policies.

---

## 4. Row Level Security (RLS) Policy Model

Every table created in `public` **must** enable Row Level Security immediately upon creation:

```sql
alter table public.<table_name> enable row level security;
```

- **Tenant Isolation:** Authenticated queries filter rows via `organization_id = public.current_user_organization_id()`.
- **Role Separation:** Role elevation (`agent`, `supervisor`, `admin`) is stored in `auth.users.raw_app_meta_data` (modifiable only by server admin logic, never by `supabase.auth.updateUser()` from the browser).

---

## 5. Running Migrations Locally & in Production

### Local Development (Supabase CLI)
```bash
supabase start
supabase db reset   # Applies all files in supabase/migrations/ and runs supabase/seed.sql/001_initial_seed.sql
```

### Production Deployment
Link your hosted Supabase project and push SQL migrations via GitHub Actions or CLI:
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
Never hardcode database passwords or connection strings in source files; store `DATABASE_URL` in local `.env.local` or GitHub/Vercel encrypted secrets.
