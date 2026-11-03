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
    email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
    mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
    mfa_secret TEXT,
    mfa_pending_secret TEXT,
    mfa_recovery_codes_json TEXT NOT NULL DEFAULT '[]',
    mfa_verified_at TEXT,
    password_changed_at TEXT,
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
  `CREATE INDEX IF NOT EXISTS idx_organizations_active_status
    ON organizations (is_active, onboarding_status, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS organization_members (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'supervisor', 'agent', 'viewer')),
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
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    mfa_verified INTEGER NOT NULL DEFAULT 0 CHECK (mfa_verified IN (0, 1)),
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_active_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions (user_id, revoked_at, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
    ON auth_sessions (token_hash)`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_type TEXT NOT NULL CHECK (token_type IN ('email_verification', 'password_reset')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup
    ON auth_tokens (token_hash, token_type)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_tokens_user
    ON auth_tokens (user_id, token_type)`,
  `CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key TEXT PRIMARY KEY NOT NULL,
    action TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    locked_until TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_security_events (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    organization_id TEXT,
    event_type TEXT NOT NULL,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_security_events_user
    ON auth_security_events (user_id, created_at DESC)`,
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
    UNIQUE (organization_id, slug),
    UNIQUE (id, organization_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_categories_id_org
    ON knowledge_categories (id, organization_id)`,
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
  `CREATE TRIGGER IF NOT EXISTS trg_knowledge_articles_category_tenant_insert
    BEFORE INSERT ON knowledge_articles
    FOR EACH ROW
    WHEN NEW.category_id IS NOT NULL
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM knowledge_categories
          WHERE id = NEW.category_id AND organization_id = NEW.organization_id
        )
        THEN RAISE(ABORT, 'CROSS_TENANT_VIOLATION: knowledge_articles.category_id must belong to the same organization_id')
      END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_knowledge_articles_category_tenant_update
    BEFORE UPDATE ON knowledge_articles
    FOR EACH ROW
    WHEN NEW.category_id IS NOT NULL
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM knowledge_categories
          WHERE id = NEW.category_id AND organization_id = NEW.organization_id
        )
        THEN RAISE(ABORT, 'CROSS_TENANT_VIOLATION: knowledge_articles.category_id must belong to the same organization_id')
      END;
    END`,
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
  `CREATE TRIGGER IF NOT EXISTS trg_knowledge_faqs_category_tenant_insert
    BEFORE INSERT ON knowledge_faqs
    FOR EACH ROW
    WHEN NEW.category_id IS NOT NULL
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM knowledge_categories
          WHERE id = NEW.category_id AND organization_id = NEW.organization_id
        )
        THEN RAISE(ABORT, 'CROSS_TENANT_VIOLATION: knowledge_faqs.category_id must belong to the same organization_id')
      END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_knowledge_faqs_category_tenant_update
    BEFORE UPDATE ON knowledge_faqs
    FOR EACH ROW
    WHEN NEW.category_id IS NOT NULL
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM knowledge_categories
          WHERE id = NEW.category_id AND organization_id = NEW.organization_id
        )
        THEN RAISE(ABORT, 'CROSS_TENANT_VIOLATION: knowledge_faqs.category_id must belong to the same organization_id')
      END;
    END`,
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
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (id, organization_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_id_org
    ON support_conversations (id, organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_support_conversations_org_status
    ON support_conversations (organization_id, status, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_conversations_org_customer
    ON support_conversations (organization_id, customer_email, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS support_messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'system', 'agent')),
    sender_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id, organization_id) REFERENCES support_conversations(id, organization_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_conv
    ON support_messages (conversation_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_org_conv
    ON support_messages (organization_id, conversation_id, created_at ASC)`,
  `CREATE TRIGGER IF NOT EXISTS trg_support_messages_tenant_insert
    BEFORE INSERT ON support_messages
    FOR EACH ROW
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM support_conversations
          WHERE id = NEW.conversation_id AND organization_id = NEW.organization_id
        )
        THEN RAISE(ABORT, 'CROSS_TENANT_VIOLATION: support_messages.organization_id must match parent support_conversations.organization_id')
      END;
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_support_messages_tenant_update
    BEFORE UPDATE ON support_messages
    FOR EACH ROW
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM support_conversations
          WHERE id = NEW.conversation_id AND organization_id = NEW.organization_id
        )
        THEN RAISE(ABORT, 'CROSS_TENANT_VIOLATION: support_messages.organization_id must match parent support_conversations.organization_id')
      END;
    END`,
];

export const KNOWLEDGE_D1_MIGRATION_SQL = [
  'PRAGMA foreign_keys = ON;',
  ...KNOWLEDGE_D1_SCHEMA_STATEMENTS.map((stmt) => `${stmt};`),
].join('\n\n');

