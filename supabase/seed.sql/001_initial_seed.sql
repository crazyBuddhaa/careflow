-- =============================================================================
-- Seed:    001_initial_seed.sql
-- Project: CareFlow (v0.1.0)
-- Client:  UltimateTechApp
-- =============================================================================

insert into public.organizations (slug, name, is_active)
values ('ultimatetechapp', 'UltimateTechApp', true)
on conflict (slug) do update
set
  name = excluded.name,
  is_active = excluded.is_active;
