-- =============================================================================
-- Migration 0007: Agent Identities, Workspace Invitations, Audit Logs & Platform Admin
-- Safe, non-destructive migration for Cloudflare D1 (SQLite)
-- =============================================================================

PRAGMA defer_foreign_keys = ON;

-- 1. Create agent_identities table (supports Business-Managed Agents without personal accounts & Linked Personal Accounts)
CREATE TABLE IF NOT EXISTS agent_identities (
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
);

CREATE INDEX IF NOT EXISTS idx_agent_identities_email
  ON agent_identities (email);

CREATE INDEX IF NOT EXISTS idx_agent_identities_user_id
  ON agent_identities (user_id);

-- 2. Create workspace_invitations table (hashed, single-use, time-limited, revocable)
CREATE TABLE IF NOT EXISTS workspace_invitations (
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
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_org_status
  ON workspace_invitations (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email_status
  ON workspace_invitations (email, status);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token_hash
  ON workspace_invitations (token_hash);

-- 3. Create workspace_audit_logs table for security & administrative activity records
CREATE TABLE IF NOT EXISTS workspace_audit_logs (
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
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_org_created
  ON workspace_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_created
  ON workspace_audit_logs (created_at DESC);
