/**
 * Minimal structural TypeScript interfaces matching Cloudflare Workers D1Database
 * and D1PreparedStatement. Allows CareFlow repositories to run against both:
 *   1. Native Cloudflare Workers D1 bindings (`env.DB`) in production
 *   2. Node's built-in `node:sqlite` (`DatabaseSync`) during local development & tests
 * without requiring third-party native C++ dependencies.
 */

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<Record<string, unknown>>>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export const KNOWLEDGE_D1_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 1 CHECK (email_verified IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'United States',
    industry TEXT NOT NULL DEFAULT 'Technology',
    website TEXT NOT NULL DEFAULT '',
    onboarding_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (onboarding_status IN ('incomplete', 'in_progress', 'ready_to_publish', 'published', 'suspended')),
    onboarding_step INTEGER NOT NULL DEFAULT 1,
    created_by_user_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS organization_members (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'agent')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (organization_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_org_members_user
    ON organization_members (user_id, is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_org_members_org
    ON organization_members (organization_id, is_active)`,
  `CREATE TABLE IF NOT EXISTS knowledge_categories (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_categories_org
    ON knowledge_categories (organization_id, display_order, name)`,
  `CREATE TABLE IF NOT EXISTS knowledge_articles (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_articles_org_status
    ON knowledge_articles (organization_id, status, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_articles_org_category
    ON knowledge_articles (organization_id, category_id)`,
  `CREATE TABLE IF NOT EXISTS knowledge_faqs (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_faqs_org_status
    ON knowledge_faqs (organization_id, status, display_order)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_faqs_org_category
    ON knowledge_faqs (organization_id, category_id)`,
  `CREATE TABLE IF NOT EXISTS organization_portal_settings (
    organization_id TEXT PRIMARY KEY NOT NULL,
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS support_agents (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'supervisor', 'admin')),
    specialty TEXT NOT NULL DEFAULT 'General Support',
    availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'offline')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, email)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_agents_org
    ON support_agents (organization_id, availability, display_name)`,
  `CREATE TABLE IF NOT EXISTS support_conversations (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_external_ref TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'portal',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'troubleshooting', 'escalated', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    category TEXT NOT NULL DEFAULT 'General',
    subject TEXT NOT NULL,
    assigned_agent_name TEXT,
    diagnostic_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_conversations_org_status
    ON support_conversations (organization_id, status, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS support_messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'system', 'agent')),
    sender_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_conv
    ON support_messages (conversation_id, created_at ASC)`,
];

export const KNOWLEDGE_D1_MIGRATION_SQL = [
  'PRAGMA foreign_keys = ON;',
  ...KNOWLEDGE_D1_SCHEMA_STATEMENTS.map((stmt) => `${stmt};`),
].join('\n\n');
