PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organization_portal_settings (
  organization_id TEXT PRIMARY KEY NOT NULL,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_agents (
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
);

CREATE INDEX IF NOT EXISTS idx_support_agents_org
  ON support_agents (organization_id, availability, display_name);

CREATE TABLE IF NOT EXISTS support_conversations (
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
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_org_status
  ON support_conversations (organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'system', 'agent')),
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conv
  ON support_messages (conversation_id, created_at ASC);
