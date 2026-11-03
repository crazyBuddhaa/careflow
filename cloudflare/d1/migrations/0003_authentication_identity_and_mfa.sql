-- =============================================================================
-- CareFlow D1 Migration 0003: Secure Authentication, Identity, Sessions & MFA
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
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
);

CREATE TABLE IF NOT EXISTS organization_members (
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
);

CREATE INDEX IF NOT EXISTS idx_org_members_user
  ON organization_members (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_org_members_org
  ON organization_members (organization_id, is_active);

CREATE TABLE IF NOT EXISTS auth_sessions (
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
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions (user_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
  ON auth_sessions (token_hash);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_type TEXT NOT NULL CHECK (token_type IN ('email_verification', 'password_reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup
  ON auth_tokens (token_hash, token_type);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user
  ON auth_tokens (user_id, token_type);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_security_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT,
  event_type TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_security_events_user
  ON auth_security_events (user_id, created_at DESC);
