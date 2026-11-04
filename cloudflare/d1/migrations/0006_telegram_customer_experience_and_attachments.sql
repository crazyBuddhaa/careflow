-- =============================================================================
-- Migration 0006: Complete Telegram Customer Support Experience & Attachments
-- Safe, non-destructive migration for Cloudflare D1 (SQLite)
-- =============================================================================

PRAGMA defer_foreign_keys = ON;

-- 1. Create tenant-isolated conversation_attachments table for Telegram & channel files
CREATE TABLE IF NOT EXISTS conversation_attachments (
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
);

CREATE INDEX IF NOT EXISTS idx_conversation_attachments_org_conv
  ON conversation_attachments (organization_id, conversation_id, created_at ASC);
