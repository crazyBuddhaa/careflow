-- =============================================================================
-- Migration: 0001_business_knowledge_management.sql
-- Target:    Cloudflare D1 (SQLite) & Local Node SQLite Runtime
-- Project:   CareFlow (v0.1.0) — Stage 1: Business Knowledge Management
-- Security:  Every table requires explicit organization_id foreign key scoping.
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'United States',
  industry TEXT NOT NULL DEFAULT 'Technology',
  website TEXT NOT NULL DEFAULT '',
  onboarding_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (onboarding_status IN ('incomplete', 'ready_to_publish', 'published')),
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_categories_org
  ON knowledge_categories (organization_id, display_order, name);

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  category_id TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  short_description TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  search_keywords TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_org_status
  ON knowledge_articles (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_org_category
  ON knowledge_articles (organization_id, category_id);

CREATE TABLE IF NOT EXISTS knowledge_faqs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  category_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  search_keywords TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_faqs_org_status
  ON knowledge_faqs (organization_id, status, display_order);

CREATE INDEX IF NOT EXISTS idx_knowledge_faqs_org_category
  ON knowledge_faqs (organization_id, category_id);
