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
    account_type TEXT NOT NULL DEFAULT 'business',
    is_platform_admin INTEGER NOT NULL DEFAULT 0,
    is_personal_account INTEGER NOT NULL DEFAULT 1,
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
    agent_identity_id TEXT,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'supervisor', 'agent', 'viewer')),
    status TEXT NOT NULL DEFAULT 'active',
    membership_status TEXT NOT NULL DEFAULT 'active',
    department TEXT NOT NULL DEFAULT 'Support',
    permissions_json TEXT NOT NULL DEFAULT '[]',
    invited_by_user_id TEXT,
    joined_at TEXT,
    suspended_at TEXT,
    revoked_at TEXT,
    departed_at TEXT,
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
    agent_identity_id TEXT,
    access_mode TEXT NOT NULL DEFAULT 'personal_account',
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
    user_id TEXT,
    agent_identity_id TEXT,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'supervisor', 'agent', 'viewer')),
    department TEXT NOT NULL DEFAULT 'Support',
    specialty TEXT NOT NULL DEFAULT 'General Support',
    availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'offline')),
    membership_status TEXT NOT NULL DEFAULT 'active',
    permissions_json TEXT NOT NULL DEFAULT '[]',
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
    customer_identity_id TEXT,
    source_channel_ref TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'portal',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'troubleshooting', 'escalated', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    category TEXT NOT NULL DEFAULT 'General',
    subject TEXT NOT NULL,
    assigned_agent_id TEXT,
    assigned_agent_name TEXT,
    diagnostic_summary TEXT NOT NULL DEFAULT '',
    escalation_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TEXT,
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
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'system', 'agent', 'bot')),
    sender_name TEXT NOT NULL,
    sender_user_id TEXT,
    body TEXT NOT NULL,
    is_internal_note INTEGER NOT NULL DEFAULT 0 CHECK (is_internal_note IN (0, 1)),
    external_message_id TEXT,
    delivery_status TEXT NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'internal')),
    delivery_error TEXT,
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
  `CREATE TABLE IF NOT EXISTS channel_integrations (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('telegram', 'portal', 'web_widget', 'email', 'whatsapp', 'api_webhooks')),
    status TEXT NOT NULL DEFAULT 'not_activated' CHECK (status IN ('not_activated', 'setup_required', 'pending_verification', 'connected', 'active', 'attention_required', 'disconnected')),
    public_token TEXT UNIQUE,
    public_token_hash TEXT UNIQUE,
    config_json TEXT NOT NULL DEFAULT '{}',
    encrypted_credentials TEXT,
    last_event_at TEXT,
    last_error_message TEXT,
    activated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, channel)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_channel_integrations_org
    ON channel_integrations (organization_id, channel, status)`,
  `CREATE INDEX IF NOT EXISTS idx_channel_integrations_public_token
    ON channel_integrations (public_token)`,
  `CREATE TABLE IF NOT EXISTS channel_customer_identities (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    external_user_id TEXT NOT NULL,
    external_chat_id TEXT NOT NULL DEFAULT '',
    external_username TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    verified_email INTEGER NOT NULL DEFAULT 0 CHECK (verified_email IN (0, 1)),
    active_conversation_id TEXT,
    session_state_json TEXT NOT NULL DEFAULT '{}',
    last_interaction_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, channel, external_user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_channel_customer_identities_lookup
    ON channel_customer_identities (organization_id, channel, external_user_id)`,
  `CREATE TABLE IF NOT EXISTS telegram_customer_contexts (
    telegram_user_id TEXT PRIMARY KEY NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    active_organization_id TEXT NOT NULL,
    public_token_used TEXT NOT NULL,
    session_state_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (active_organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    message_id TEXT,
    channel TEXT NOT NULL DEFAULT 'telegram',
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    external_file_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id, organization_id) REFERENCES support_conversations(id, organization_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_attachments_org_conv
    ON conversation_attachments (organization_id, conversation_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS telegram_agent_links (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_code' CHECK (status IN ('pending_code', 'linked', 'revoked')),
    link_code_hash TEXT UNIQUE,
    code_expires_at TEXT,
    code_used_at TEXT,
    telegram_user_id TEXT,
    telegram_chat_id TEXT,
    telegram_username TEXT,
    active_organization_id TEXT,
    active_conversation_id TEXT,
    notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
    linked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (user_id, organization_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_agent_links_tg_user
    ON telegram_agent_links (telegram_user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_telegram_agent_links_org
    ON telegram_agent_links (organization_id, status)`,
  `CREATE TABLE IF NOT EXISTS webhook_event_logs (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    organization_id TEXT,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processed',
    error_message TEXT,
    processed_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_provider_key
    ON webhook_event_logs (provider, idempotency_key)`,
  `CREATE TABLE IF NOT EXISTS conversation_activity_logs (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'agent', 'system', 'bot')),
    action_type TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id, organization_id) REFERENCES support_conversations(id, organization_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conv_activity_logs_org_conv
    ON conversation_activity_logs (organization_id, conversation_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS saved_replies (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    body TEXT NOT NULL,
    shortcut TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saved_replies_org
    ON saved_replies (organization_id, category, title)`,
  `CREATE TABLE IF NOT EXISTS agent_identities (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
    department TEXT NOT NULL DEFAULT 'Support',
    specialty TEXT NOT NULL DEFAULT 'General Support',
    access_mode TEXT NOT NULL DEFAULT 'business_managed' CHECK (access_mode IN ('business_managed', 'personal_account')),
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_identities_email
    ON agent_identities (email)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_identities_user_id
    ON agent_identities (user_id)`,
  `CREATE TABLE IF NOT EXISTS workspace_invitations (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'supervisor', 'agent', 'viewer')),
    department TEXT NOT NULL DEFAULT 'Support',
    specialty TEXT NOT NULL DEFAULT 'General Support',
    permissions_json TEXT NOT NULL DEFAULT '[]',
    token_hash TEXT NOT NULL UNIQUE,
    invited_by_user_id TEXT,
    invited_by_name TEXT NOT NULL DEFAULT 'Workspace Administrator',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_invitations_org_status
    ON workspace_invitations (organization_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email_status
    ON workspace_invitations (email, status)`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token_hash
    ON workspace_invitations (token_hash)`,
  `CREATE TABLE IF NOT EXISTS workspace_audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT,
    actor_user_id TEXT,
    actor_email TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    ip_address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_org_created
    ON workspace_audit_logs (organization_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_created
    ON workspace_audit_logs (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS organization_operations_configs (
    organization_id TEXT PRIMARY KEY NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    business_closing_time TEXT NOT NULL DEFAULT '18:00',
    fulfilment_method TEXT NOT NULL DEFAULT 'both' CHECK (fulfilment_method IN ('supervisor_controlled', 'agent_assisted', 'both')),
    allow_agent_direct_approval INTEGER NOT NULL DEFAULT 0 CHECK (allow_agent_direct_approval IN (0, 1)),
    auto_assign_supervisor INTEGER NOT NULL DEFAULT 1 CHECK (auto_assign_supervisor IN (0, 1)),
    sla_first_response_minutes INTEGER NOT NULL DEFAULT 30,
    sla_resolution_hours INTEGER NOT NULL DEFAULT 24,
    sla_overdue_hours INTEGER NOT NULL DEFAULT 48,
    inactivity_timeout_minutes INTEGER NOT NULL DEFAULT 15,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS complaint_categories (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    requires_order_id INTEGER NOT NULL DEFAULT 1 CHECK (requires_order_id IN (0, 1)),
    requires_login_info INTEGER NOT NULL DEFAULT 0 CHECK (requires_login_info IN (0, 1)),
    requires_evidence INTEGER NOT NULL DEFAULT 0 CHECK (requires_evidence IN (0, 1)),
    custom_fields_json TEXT NOT NULL DEFAULT '[]',
    default_priority TEXT NOT NULL DEFAULT 'normal' CHECK (default_priority IN ('low', 'normal', 'high', 'urgent')),
    auto_escalate_to_supervisor INTEGER NOT NULL DEFAULT 0 CHECK (auto_escalate_to_supervisor IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    display_order INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, slug)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_complaint_categories_org
    ON complaint_categories (organization_id, is_active, display_order)`,
  `CREATE TABLE IF NOT EXISTS support_complaints (
    id TEXT PRIMARY KEY NOT NULL,
    reference_code TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    conversation_id TEXT,
    ticket_id TEXT,
    customer_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL DEFAULT '',
    order_id TEXT NOT NULL DEFAULT '',
    product_or_service TEXT NOT NULL DEFAULT '',
    category_id TEXT,
    category_name TEXT NOT NULL DEFAULT 'General Complaint',
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'pending_review', 'in_progress', 'awaiting_information', 'approved', 'awaiting_replacement', 'declined', 'resolved')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    description TEXT NOT NULL,
    encrypted_login_info TEXT,
    login_info_masked TEXT NOT NULL DEFAULT '',
    custom_fields_json TEXT NOT NULL DEFAULT '{}',
    duplicate_of_complaint_id TEXT,
    is_potential_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (is_potential_duplicate IN (0, 1)),
    created_by_user_id TEXT,
    created_by_name TEXT NOT NULL,
    created_by_role TEXT NOT NULL DEFAULT 'agent',
    assigned_agent_id TEXT,
    assigned_agent_name TEXT,
    assigned_supervisor_id TEXT,
    assigned_supervisor_name TEXT,
    assigned_specialist_name TEXT,
    assigned_specialist_department TEXT,
    sla_deadline_at TEXT,
    escalated_at TEXT,
    reviewed_by_supervisor_id TEXT,
    reviewed_by_supervisor_name TEXT,
    reviewed_at TEXT,
    decision TEXT CHECK (decision IN ('approved', 'declined', 'info_requested')),
    decision_reason TEXT,
    resolution_type TEXT,
    resolution_summary TEXT,
    allocated_replacement_id TEXT,
    delivered_at TEXT,
    resolved_at TEXT,
    reopened_count INTEGER NOT NULL DEFAULT 0,
    last_activity_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, reference_code),
    UNIQUE (id, organization_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_complaints_org_status
    ON support_complaints (organization_id, status, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_complaints_org_order
    ON support_complaints (organization_id, order_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_support_complaints_org_supervisor
    ON support_complaints (organization_id, assigned_supervisor_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_support_complaints_org_agent
    ON support_complaints (organization_id, assigned_agent_id, status)`,
  `CREATE TABLE IF NOT EXISTS complaint_evidence (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    complaint_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/png',
    file_url_or_data TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    uploaded_by_user_id TEXT,
    uploaded_by_name TEXT NOT NULL,
    uploaded_by_role TEXT NOT NULL DEFAULT 'agent',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (complaint_id, organization_id) REFERENCES support_complaints(id, organization_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_complaint_evidence_org_complaint
    ON complaint_evidence (organization_id, complaint_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS complaint_internal_comments (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    complaint_id TEXT NOT NULL,
    author_user_id TEXT,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL DEFAULT 'agent',
    comment_type TEXT NOT NULL DEFAULT 'internal_note' CHECK (comment_type IN ('internal_note', 'escalation_note', 'supervisor_instruction', 'decision_reason', 'info_request', 'customer_update')),
    body TEXT NOT NULL,
    is_visible_to_customer INTEGER NOT NULL DEFAULT 0 CHECK (is_visible_to_customer IN (0, 1)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (complaint_id, organization_id) REFERENCES support_complaints(id, organization_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_complaint_comments_org_complaint
    ON complaint_internal_comments (organization_id, complaint_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS complaint_assignments_history (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    complaint_id TEXT NOT NULL,
    from_user_id TEXT,
    from_user_name TEXT,
    to_user_id TEXT,
    to_user_name TEXT NOT NULL,
    assignment_role TEXT NOT NULL DEFAULT 'supervisor' CHECK (assignment_role IN ('agent', 'supervisor', 'specialist')),
    reason TEXT NOT NULL DEFAULT '',
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (complaint_id, organization_id) REFERENCES support_complaints(id, organization_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_complaint_assignments_org_complaint
    ON complaint_assignments_history (organization_id, complaint_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS replacement_inventory_categories (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    product_or_service TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    min_stock_threshold INTEGER NOT NULL DEFAULT 5,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE (organization_id, slug)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_replacement_inv_categories_org
    ON replacement_inventory_categories (organization_id, is_active, name)`,
  `CREATE TABLE IF NOT EXISTS replacement_stock_batches (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    batch_code TEXT NOT NULL,
    product_or_service TEXT NOT NULL,
    supplier_ref TEXT NOT NULL DEFAULT '',
    total_added INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES replacement_inventory_categories(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_replacement_batches_org
    ON replacement_stock_batches (organization_id, category_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS replacement_inventory_items (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    batch_id TEXT,
    product_or_service TEXT NOT NULL,
    category_name TEXT NOT NULL,
    identifier_masked TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    supplier_ref TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'INVALID', 'WITHDRAWN')),
    expires_at TEXT,
    associated_complaint_id TEXT,
    associated_order_id TEXT,
    reserved_by_user_id TEXT,
    reserved_by_name TEXT,
    reserved_at TEXT,
    issued_by_user_id TEXT,
    issued_by_name TEXT,
    issued_at TEXT,
    added_by_user_id TEXT,
    added_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES replacement_inventory_categories(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_replacement_items_org_status
    ON replacement_inventory_items (organization_id, status, category_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_replacement_items_org_complaint
    ON replacement_inventory_items (organization_id, associated_complaint_id)`,
  `CREATE TABLE IF NOT EXISTS replacement_inventory_movements (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    batch_id TEXT,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('added', 'bulk_imported', 'updated', 'reserved', 'reservation_released', 'issued', 'marked_expired', 'marked_invalid', 'withdrawn')),
    previous_status TEXT,
    new_status TEXT NOT NULL,
    complaint_id TEXT,
    order_id TEXT,
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL DEFAULT 'admin',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES replacement_inventory_items(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_replacement_movements_org_created
    ON replacement_inventory_movements (organization_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS operational_activity_events (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    event_category TEXT NOT NULL CHECK (event_category IN ('agent_activity', 'conversation', 'ticket', 'complaint', 'supervisor', 'inventory', 'replacement', 'report', 'settings')),
    event_type TEXT NOT NULL,
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL DEFAULT 'agent',
    case_reference TEXT,
    complaint_id TEXT,
    conversation_id TEXT,
    inventory_item_id TEXT,
    product_or_service TEXT,
    summary TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_operational_activity_org_created
    ON operational_activity_events (organization_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_activity_org_actor
    ON operational_activity_events (organization_id, actor_user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_activity_org_case
    ON operational_activity_events (organization_id, case_reference, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS agent_activity_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL DEFAULT 'agent',
    started_at TEXT NOT NULL,
    last_meaningful_action_at TEXT NOT NULL,
    last_action_type TEXT NOT NULL DEFAULT '',
    actions_count INTEGER NOT NULL DEFAULT 1,
    ended_at TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_activity_sessions_org_user
    ON agent_activity_sessions (organization_id, user_id, last_meaningful_action_at DESC)`,
  `CREATE TABLE IF NOT EXISTS qa_evaluations (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    conversation_id TEXT,
    complaint_id TEXT,
    case_reference TEXT NOT NULL DEFAULT '',
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    evaluator_user_id TEXT,
    evaluator_name TEXT NOT NULL,
    accuracy_score INTEGER NOT NULL DEFAULT 5 CHECK (accuracy_score BETWEEN 1 AND 5),
    professionalism_score INTEGER NOT NULL DEFAULT 5 CHECK (professionalism_score BETWEEN 1 AND 5),
    resolution_effectiveness_score INTEGER NOT NULL DEFAULT 5 CHECK (resolution_effectiveness_score BETWEEN 1 AND 5),
    overall_score INTEGER NOT NULL DEFAULT 100 CHECK (overall_score BETWEEN 0 AND 100),
    case_complexity TEXT NOT NULL DEFAULT 'standard' CHECK (case_complexity IN ('low', 'standard', 'complex')),
    feedback_notes TEXT NOT NULL DEFAULT '',
    coaching_recommendations TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_qa_evaluations_org_agent
    ON qa_evaluations (organization_id, agent_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS customer_feedback_ratings (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    conversation_id TEXT,
    complaint_id TEXT,
    case_reference TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'portal',
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_customer_feedback_org_created
    ON customer_feedback_ratings (organization_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS workflow_automation_rules (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    rule_type TEXT NOT NULL CHECK (rule_type IN ('auto_assign_enquiry', 'auto_categorise_enquiry', 'auto_escalate_condition', 'notify_supervisor_overdue', 'reassign_unavailable_agent', 'notify_agent_sla_warning', 'notify_customer_status_change', 'trigger_pending_followup')),
    trigger_event TEXT NOT NULL DEFAULT 'on_case_event',
    conditions_json TEXT NOT NULL DEFAULT '{}',
    actions_json TEXT NOT NULL DEFAULT '{}',
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    priority_order INTEGER NOT NULL DEFAULT 10,
    execution_count INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TEXT,
    created_by_name TEXT NOT NULL DEFAULT 'Administrator',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_automation_rules_org
    ON workflow_automation_rules (organization_id, is_enabled, priority_order ASC)`,
  `CREATE TABLE IF NOT EXISTS workflow_automation_logs (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'complaint',
    target_id TEXT NOT NULL,
    target_reference TEXT NOT NULL DEFAULT '',
    action_summary TEXT NOT NULL,
    actor_name TEXT NOT NULL DEFAULT 'Automation Engine',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_automation_logs_org_created
    ON workflow_automation_logs (organization_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_automation_logs_dedup
    ON workflow_automation_logs (organization_id, rule_id, target_id)`,
];

export const KNOWLEDGE_D1_MIGRATION_SQL = [
  'PRAGMA foreign_keys = ON;',
  ...KNOWLEDGE_D1_SCHEMA_STATEMENTS.map((stmt) => `${stmt};`),
].join('\n\n');

