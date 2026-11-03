-- =============================================================================
-- Migration 0005: Unified Multi-Channel Customer-Support Operating System
-- Safe, non-destructive migration for Cloudflare D1 (SQLite)
-- =============================================================================

PRAGMA defer_foreign_keys = ON;

-- 0. Upgrade support_agents, support_conversations, and support_messages non-destructively
ALTER TABLE support_agents ADD COLUMN user_id TEXT;

DROP TRIGGER IF EXISTS trg_support_messages_tenant_insert;
DROP TRIGGER IF EXISTS trg_support_messages_tenant_update;

CREATE TABLE support_conversations_new (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_external_ref TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'portal',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'troubleshooting', 'escalated', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category TEXT NOT NULL DEFAULT 'General',
  subject TEXT NOT NULL,
  assigned_agent_id TEXT,
  assigned_agent_name TEXT,
  customer_channel_identity_id TEXT,
  diagnostic_summary TEXT NOT NULL DEFAULT '',
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (id, organization_id)
);

INSERT INTO support_conversations_new (
  id,
  organization_id,
  customer_name,
  customer_email,
  customer_external_ref,
  channel,
  status,
  priority,
  category,
  subject,
  assigned_agent_id,
  assigned_agent_name,
  customer_channel_identity_id,
  diagnostic_summary,
  last_message_at,
  created_at,
  updated_at
)
SELECT
  id,
  organization_id,
  customer_name,
  customer_email,
  customer_external_ref,
  channel,
  status,
  priority,
  category,
  subject,
  NULL,
  assigned_agent_name,
  NULL,
  diagnostic_summary,
  updated_at,
  created_at,
  updated_at
FROM support_conversations;

DROP TABLE support_conversations;
ALTER TABLE support_conversations_new RENAME TO support_conversations;

CREATE INDEX IF NOT EXISTS idx_support_conversations_org_status
  ON support_conversations (organization_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_id_org
  ON support_conversations (id, organization_id);

CREATE INDEX IF NOT EXISTS idx_support_conversations_org_customer
  ON support_conversations (organization_id, customer_email, updated_at DESC);

CREATE TABLE support_messages_new (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'system', 'agent', 'bot')),
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'portal',
  is_internal_note INTEGER NOT NULL DEFAULT 0 CHECK (is_internal_note IN (0, 1)),
  delivery_status TEXT NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'internal')),
  external_message_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id, organization_id) REFERENCES support_conversations(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO support_messages_new (
  id,
  conversation_id,
  organization_id,
  sender_type,
  sender_name,
  body,
  channel,
  is_internal_note,
  delivery_status,
  external_message_id,
  created_at
)
SELECT
  id,
  conversation_id,
  organization_id,
  sender_type,
  sender_name,
  body,
  'portal',
  0,
  'delivered',
  NULL,
  created_at
FROM support_messages;

DROP TABLE support_messages;
ALTER TABLE support_messages_new RENAME TO support_messages;

CREATE INDEX IF NOT EXISTS idx_support_messages_conv
  ON support_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_support_messages_org_conv
  ON support_messages (organization_id, conversation_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS trg_support_messages_tenant_insert
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
  END;

CREATE TRIGGER IF NOT EXISTS trg_support_messages_tenant_update
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
  END;

-- 1. Create channel_integrations table (Independent channel lifecycle per business)
CREATE TABLE IF NOT EXISTS channel_integrations (
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
);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_org
  ON channel_integrations (organization_id, channel, status);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_public_token
  ON channel_integrations (public_token);

-- 2. Create channel_customer_identities table (Tenant-scoped customer identities per channel)
CREATE TABLE IF NOT EXISTS channel_customer_identities (
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
  last_interaction_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, channel, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_customer_identities_lookup
  ON channel_customer_identities (organization_id, channel, external_user_id);

-- 3. Create telegram_customer_contexts table (Central bot active business context per Telegram customer)
CREATE TABLE IF NOT EXISTS telegram_customer_contexts (
  telegram_user_id TEXT PRIMARY KEY NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  active_organization_id TEXT NOT NULL,
  public_token_used TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (active_organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- 4. Create telegram_agent_links table (Single-use linking codes & verified numeric Telegram user IDs for agents)
CREATE TABLE IF NOT EXISTS telegram_agent_links (
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
);

CREATE INDEX IF NOT EXISTS idx_telegram_agent_links_tg_user
  ON telegram_agent_links (telegram_user_id, status);

CREATE INDEX IF NOT EXISTS idx_telegram_agent_links_org
  ON telegram_agent_links (organization_id, status);

-- 5. Create webhook_event_logs table (Update deduplication & idempotent processing)
CREATE TABLE IF NOT EXISTS webhook_event_logs (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  organization_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  error_message TEXT,
  processed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_provider_key
  ON webhook_event_logs (provider, idempotency_key);

-- 6. Create conversation_activity_logs table (Assignment history, priority/status changes, escalations)
CREATE TABLE IF NOT EXISTS conversation_activity_logs (
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
);

CREATE INDEX IF NOT EXISTS idx_conv_activity_logs_org_conv
  ON conversation_activity_logs (organization_id, conversation_id, created_at ASC);

-- 7. Create saved_replies table (Tenant-scoped canned responses for web & Telegram agents)
CREATE TABLE IF NOT EXISTS saved_replies (
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
);

CREATE INDEX IF NOT EXISTS idx_saved_replies_org
  ON saved_replies (organization_id, category, title);
