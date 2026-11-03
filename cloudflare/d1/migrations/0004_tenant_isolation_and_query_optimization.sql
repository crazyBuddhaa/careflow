-- =============================================================================
-- CareFlow D1 Migration 0004: Tenant Isolation Constraints, Triggers & Indexes
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_organizations_active_status
  ON organizations (is_active, onboarding_status, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_categories_id_org
  ON knowledge_categories (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_id_org
  ON support_conversations (id, organization_id);

CREATE INDEX IF NOT EXISTS idx_support_conversations_org_customer
  ON support_conversations (organization_id, customer_email, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_org_conv
  ON support_messages (organization_id, conversation_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS trg_knowledge_articles_category_tenant_insert
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
  END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_articles_category_tenant_update
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
  END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_faqs_category_tenant_insert
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
  END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_faqs_category_tenant_update
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
  END;

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
