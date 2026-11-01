-- =============================================================================
-- Migration: 20261101000000_foundation_architecture.sql
-- Project:   CareFlow (v0.1.0)
-- Purpose:   Establish foundational PostgreSQL extensions, utility triggers,
--            tenant organization boundary, and Row Level Security (RLS) baseline.
--            Note: Full production domain tables (conversations, messages,
--            knowledge_articles, escalations) are intentionally deferred per
--            v0.1.0 architectural scope.
-- =============================================================================

-- 1. Required Extensions
create extension if not exists "pgcrypto";

-- 2. Reusable Timestamp Trigger Function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- 3. Foundational Multi-Tenant Boundary Table (Organizations)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

-- 4. Row Level Security (RLS) Baseline Architecture
alter table public.organizations enable row level security;

-- Helper function extracting tenant claim from Supabase Auth JWT app_metadata
create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(
    (coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb -> 'app_metadata' ->> 'organization_id'),
    ''
  )::uuid;
$$;

-- Authenticated members may read their own active organization metadata
create policy "Authenticated users can view their assigned organization"
  on public.organizations
  for select
  to authenticated
  using (
    is_active = true
    and id = public.current_user_organization_id()
  );

-- Public widget bootstrap lookup limited strictly to active organization lookup by slug
create policy "Public widget bootstrap can verify active organizations"
  on public.organizations
  for select
  to anon
  using (is_active = true);
