import { getRegisteredPlatformSuperAdminEmails } from '@careflow/shared';
import {
  KNOWLEDGE_D1_SCHEMA_STATEMENTS,
  type D1DatabaseLike,
} from './d1-types';
import { NORTHSTAR_COMMERCE_PRESET } from './d1-portal-presets';

const DEFAULT_TENANTS = [
  {
    id: 'org_northstar_commerce',
    slug: 'northstar-commerce',
    name: 'Northstar Commerce',
    country: 'United States',
    industry: 'E-commerce and retail',
    onboardingStatus: 'published',
  },
];

/**
 * Ensures the SQLite/D1 schema and base tables exist.
 * Uses statement-by-statement `db.prepare(sql).run()` so initialization works
 * identically on Cloudflare Workers D1 (`env.DB`) and local Node SQLite.
 *
 * Note: UltimateTechApp (`org_ultimatetechapp`) is intentionally NOT pre-seeded
 * so that it (and any customer business) goes through normal registration and
 * 7-step guided onboarding.
 */
export async function bootstrapKnowledgeD1Schema(db: D1DatabaseLike): Promise<void> {
  for (const statement of KNOWLEDGE_D1_SCHEMA_STATEMENTS) {
    await db.prepare(statement).run();
  }

  // Safe migrations for pre-existing databases that had an older organizations or users schema
  const schemaAlterations = [
    `ALTER TABLE organizations ADD COLUMN country TEXT NOT NULL DEFAULT 'United States'`,
    `ALTER TABLE organizations ADD COLUMN industry TEXT NOT NULL DEFAULT 'Technology'`,
    `ALTER TABLE organizations ADD COLUMN website TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE organizations ADD COLUMN onboarding_status TEXT NOT NULL DEFAULT 'incomplete'`,
    `ALTER TABLE organizations ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE organizations ADD COLUMN created_by_user_id TEXT`,
    `ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN mfa_secret TEXT`,
    `ALTER TABLE users ADD COLUMN mfa_pending_secret TEXT`,
    `ALTER TABLE users ADD COLUMN mfa_recovery_codes_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE users ADD COLUMN mfa_verified_at TEXT`,
    `ALTER TABLE users ADD COLUMN password_changed_at TEXT`,
    `ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'business'`,
    `ALTER TABLE users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN is_personal_account INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE organization_members ADD COLUMN agent_identity_id TEXT`,
    `ALTER TABLE organization_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE organization_members ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE organization_members ADD COLUMN department TEXT NOT NULL DEFAULT 'Support'`,
    `ALTER TABLE organization_members ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE organization_members ADD COLUMN invited_by_user_id TEXT`,
    `ALTER TABLE organization_members ADD COLUMN joined_at TEXT`,
    `ALTER TABLE organization_members ADD COLUMN suspended_at TEXT`,
    `ALTER TABLE organization_members ADD COLUMN revoked_at TEXT`,
    `ALTER TABLE organization_members ADD COLUMN departed_at TEXT`,
    `ALTER TABLE agent_identities ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE auth_sessions ADD COLUMN agent_identity_id TEXT`,
    `ALTER TABLE auth_sessions ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'personal_account'`,
    `ALTER TABLE support_agents ADD COLUMN user_id TEXT`,
    `ALTER TABLE support_agents ADD COLUMN agent_identity_id TEXT`,
    `ALTER TABLE support_agents ADD COLUMN department TEXT NOT NULL DEFAULT 'Support'`,
    `ALTER TABLE support_agents ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE support_agents ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE support_conversations ADD COLUMN customer_identity_id TEXT`,
    `ALTER TABLE support_conversations ADD COLUMN source_channel_ref TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE support_conversations ADD COLUMN assigned_agent_id TEXT`,
    `ALTER TABLE support_conversations ADD COLUMN escalation_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE support_conversations ADD COLUMN last_message_at TEXT`,
    `ALTER TABLE support_messages ADD COLUMN sender_user_id TEXT`,
    `ALTER TABLE support_messages ADD COLUMN is_internal_note INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE support_messages ADD COLUMN external_message_id TEXT`,
    `ALTER TABLE support_messages ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'delivered'`,
    `ALTER TABLE support_messages ADD COLUMN delivery_error TEXT`,
    `ALTER TABLE channel_customer_identities ADD COLUMN session_state_json TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE telegram_customer_contexts ADD COLUMN session_state_json TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE support_complaints ADD COLUMN assigned_specialist_name TEXT`,
    `ALTER TABLE support_complaints ADD COLUMN assigned_specialist_department TEXT`,
    `ALTER TABLE support_complaints ADD COLUMN sla_deadline_at TEXT`,
    `ALTER TABLE support_conversations ADD COLUMN department TEXT NOT NULL DEFAULT 'Support'`,
    `ALTER TABLE support_conversations ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE support_conversations ADD COLUMN sla_deadline_at TEXT`,
  ];
  for (const alterSql of schemaAlterations) {
    try {
      await db.prepare(alterSql).run();
    } catch {
      // Column already exists or already upgraded
    }
  }

  // Upgrade complaint_assignments_history CHECK constraint to include 'specialist' if pre-existing
  try {
    const cahMeta = await db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'complaint_assignments_history'`
      )
      .first<{ sql: string }>();
    if (cahMeta?.sql && !cahMeta.sql.includes("'specialist'")) {
      await db.prepare(`PRAGMA foreign_keys = OFF`).run();
      await db
        .prepare(
          `CREATE TABLE complaint_assignments_history_v2 (
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
          )`
        )
        .run();
      await db
        .prepare(
          `INSERT INTO complaint_assignments_history_v2
             (id, organization_id, complaint_id, from_user_id, from_user_name, to_user_id, to_user_name, assignment_role, reason, actor_user_id, actor_name, created_at)
           SELECT id, organization_id, complaint_id, from_user_id, from_user_name, to_user_id, to_user_name, assignment_role, reason, actor_user_id, actor_name, created_at
           FROM complaint_assignments_history`
        )
        .run();
      await db.prepare(`DROP TABLE complaint_assignments_history`).run();
      await db
        .prepare(`ALTER TABLE complaint_assignments_history_v2 RENAME TO complaint_assignments_history`)
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_complaint_assignments_org_complaint ON complaint_assignments_history (organization_id, complaint_id, created_at ASC)`
        )
        .run();
      await db.prepare(`PRAGMA foreign_keys = ON`).run();
    }
  } catch {
    // Table already upgraded
  }

  // Upgrade support_conversations CHECK constraint to include 'pending' status if pre-existing
  try {
    const convMeta = await db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'support_conversations'`
      )
      .first<{ sql: string }>();
    if (convMeta?.sql && !convMeta.sql.includes("'pending'")) {
      await db.prepare(`PRAGMA foreign_keys = OFF`).run();
      await db
        .prepare(
          `CREATE TABLE support_conversations_v2 (
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
          )`
        )
        .run();
      await db
        .prepare(
          `INSERT INTO support_conversations_v2
             (id, organization_id, customer_name, customer_email, customer_external_ref, customer_identity_id, source_channel_ref, channel, status, priority, category, subject, assigned_agent_id, assigned_agent_name, diagnostic_summary, escalation_count, last_message_at, created_at, updated_at)
           SELECT id, organization_id, customer_name, customer_email, customer_external_ref, customer_identity_id, source_channel_ref, channel, status, priority, category, subject, assigned_agent_id, assigned_agent_name, diagnostic_summary, escalation_count, last_message_at, created_at, updated_at
           FROM support_conversations`
        )
        .run();
      await db.prepare(`DROP TABLE support_conversations`).run();
      await db
        .prepare(`ALTER TABLE support_conversations_v2 RENAME TO support_conversations`)
        .run();
      await db
        .prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_id_org ON support_conversations (id, organization_id)`
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_support_conversations_org_status ON support_conversations (organization_id, status, updated_at DESC)`
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_support_conversations_org_customer ON support_conversations (organization_id, customer_email, updated_at DESC)`
        )
        .run();
      await db.prepare(`PRAGMA foreign_keys = ON`).run();
    }
  } catch {
    // Table already upgraded
  }

  // Upgrade support_messages CHECK constraint to include 'bot' sender_type if pre-existing
  try {
    const msgMeta = await db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'support_messages'`
      )
      .first<{ sql: string }>();
    if (msgMeta?.sql && !msgMeta.sql.includes("'bot'")) {
      await db.prepare(`DROP TRIGGER IF EXISTS trg_support_messages_tenant_insert`).run();
      await db.prepare(`DROP TRIGGER IF EXISTS trg_support_messages_tenant_update`).run();
      await db
        .prepare(
          `CREATE TABLE support_messages_v2 (
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
          )`
        )
        .run();
      await db
        .prepare(
          `INSERT INTO support_messages_v2
             (id, conversation_id, organization_id, sender_type, sender_name, sender_user_id, body, is_internal_note, external_message_id, delivery_status, delivery_error, created_at)
           SELECT id, conversation_id, organization_id, sender_type, sender_name, sender_user_id, body, is_internal_note, external_message_id, delivery_status, delivery_error, created_at
           FROM support_messages`
        )
        .run();
      await db.prepare(`DROP TABLE support_messages`).run();
      await db
        .prepare(`ALTER TABLE support_messages_v2 RENAME TO support_messages`)
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON support_messages (conversation_id, created_at ASC)`
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_support_messages_org_conv ON support_messages (organization_id, conversation_id, created_at ASC)`
        )
        .run();
      await db
        .prepare(
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
            END`
        )
        .run();
      await db
        .prepare(
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
            END`
        )
        .run();
    }
  } catch {
    // Table already upgraded
  }

  try {
    const memberTableMeta = await db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'organization_members'`
      )
      .first<{ sql: string }>();
    if (memberTableMeta?.sql && !memberTableMeta.sql.includes("'viewer'")) {
      await db
        .prepare(
          `CREATE TABLE organization_members_v2 (
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
          )`
        )
        .run();
      await db
        .prepare(
          `INSERT INTO organization_members_v2
           SELECT id, organization_id, user_id, role, is_active, created_at, updated_at
           FROM organization_members`
        )
        .run();
      await db.prepare(`DROP TABLE organization_members`).run();
      await db
        .prepare(`ALTER TABLE organization_members_v2 RENAME TO organization_members`)
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members (user_id, is_active)`
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members (organization_id, is_active)`
        )
        .run();
    }
  } catch {
    // Table already upgraded
  }

  // Remove any legacy pre-seeded UltimateTechApp rows (where id = 'org_ultimatetechapp' and created_by_user_id IS NULL)
  // so that UltimateTechApp can be registered cleanly through the normal /onboarding registration flow.
  try {
    await db
      .prepare(
        `DELETE FROM organizations WHERE id = 'org_ultimatetechapp' AND created_by_user_id IS NULL`
      )
      .run();
    await db
      .prepare(`DELETE FROM users WHERE id = 'user_admin_default_uta'`)
      .run();
  } catch {
    // Ignore if already removed
  }

  const now = new Date().toISOString();

  // Upgrade support_agents CHECK constraint if pre-existing table only allowed ('agent', 'supervisor', 'admin')
  try {
    const agtMeta = await db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'support_agents'`)
      .first<{ sql: string }>();
    if (agtMeta?.sql && !agtMeta.sql.includes("'viewer'")) {
      await db.prepare(`PRAGMA foreign_keys = OFF`).run();
      await db
        .prepare(
          `CREATE TABLE support_agents_v2 (
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
          )`
        )
        .run();
      await db
        .prepare(
          `INSERT INTO support_agents_v2
             (id, organization_id, user_id, agent_identity_id, display_name, email, role, department, specialty, availability, membership_status, permissions_json, created_at, updated_at)
           SELECT id, organization_id, user_id, agent_identity_id, display_name, email, role, COALESCE(department, 'Support'), specialty, availability, COALESCE(membership_status, 'active'), COALESCE(permissions_json, '[]'), created_at, updated_at
           FROM support_agents`
        )
        .run();
      await db.prepare(`DROP TABLE support_agents`).run();
      await db.prepare(`ALTER TABLE support_agents_v2 RENAME TO support_agents`).run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_support_agents_org ON support_agents (organization_id, availability, display_name)`
        )
        .run();
      await db.prepare(`PRAGMA foreign_keys = ON`).run();
    }
  } catch {
    // Table already upgraded
  }

  // Ensure internal Agent Hub organization row exists (is_active = 0) so standalone registered agents
  // with 0 business workspaces can hold valid D1 sessions without violating foreign keys.
  await db
    .prepare(
      `INSERT INTO organizations (id, slug, name, country, industry, onboarding_status, is_active, created_at, updated_at)
       VALUES ('org_customcare_agent_hub', 'customcare-agent-hub', 'CustomCare Agent Hub', 'United States', 'Customer Support', 'incomplete', 0, ?, ?)
       ON CONFLICT (id) DO NOTHING`
    )
    .bind(now, now)
    .run();

  // Ensure configured platform super-admin accounts (role account + CAREFLOW_SUPER_ADMIN_EMAILS) are promoted
  const configuredSuperAdmins = getRegisteredPlatformSuperAdminEmails();
  for (const adminEmail of configuredSuperAdmins) {
    await db
      .prepare(
        `UPDATE users
         SET is_platform_admin = 1
         WHERE LOWER(email) = ?`
      )
      .bind(adminEmail.toLowerCase())
      .run();
  }

  for (const org of DEFAULT_TENANTS) {
    await db
      .prepare(
        `INSERT INTO organizations (id, slug, name, country, industry, onboarding_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           country = excluded.country,
           industry = excluded.industry,
           onboarding_status = COALESCE(organizations.onboarding_status, excluded.onboarding_status)`
      )
      .bind(org.id, org.slug, org.name, org.country, org.industry, org.onboardingStatus, now, now)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (organization_id) DO NOTHING`
    )
    .bind('org_northstar_commerce', JSON.stringify(NORTHSTAR_COMMERCE_PRESET), now)
    .run();

  // Seed Northstar Commerce with distinct categories & articles to demonstrate multi-business isolation
  const existingNorthstarCount = await db
    .prepare(`SELECT COUNT(*) as total FROM knowledge_categories WHERE organization_id = ?`)
    .bind('org_northstar_commerce')
    .first<{ total: number }>();

  if ((existingNorthstarCount?.total ?? 0) === 0) {
    await db
      .prepare(
        `INSERT INTO knowledge_categories
           (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'cat_ns_orders',
        'org_northstar_commerce',
        'orders-and-shipping',
        'Orders and Shipping',
        'Order tracking, parcel dispatch, and delivery updates for Northstar Commerce.',
        10,
        now,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO knowledge_categories
           (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'cat_ns_returns',
        'org_northstar_commerce',
        'returns-and-exchanges',
        'Returns and Exchanges',
        '30-day return eligibility, prepaid shipping labels, and size exchanges.',
        20,
        now,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO knowledge_articles
           (id, organization_id, category_id, slug, title, short_description, content, tags_json, status, search_keywords, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`
      )
      .bind(
        'art_ns_tracking',
        'org_northstar_commerce',
        'cat_ns_orders',
        'tracking-dispatched-parcels',
        'Tracking Dispatched Parcels and Carrier Scans',
        'How to locate your Northstar tracking code and interpret carrier scan milestones.',
        'Once your Northstar order leaves our fulfillment hub, your tracking number is posted inside your Order Confirmation summary.\n\n1. Open Order History and select your active order.\n2. Copy the carrier tracking number.\n3. Allow up to 24 hours after initial dispatch for the first regional hub scan.',
        JSON.stringify(['orders', 'shipping', 'tracking']),
        'tracking dispatched parcels carrier scans order history northstar',
        now,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO knowledge_faqs
           (id, organization_id, category_id, question, answer, status, search_keywords, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'faq_ns_order_1',
        'org_northstar_commerce',
        'cat_ns_orders',
        'Where do I find my Northstar order tracking code?',
        'Your tracking code is listed inside your Northstar order confirmation summary once your parcel has been dispatched.',
        'published',
        'where find northstar order tracking code parcel dispatch',
        10,
        now,
        now
      )
      .run();
  }

  const existingNsAgents = await db
    .prepare(`SELECT COUNT(*) AS total FROM support_agents WHERE organization_id = ?`)
    .bind('org_northstar_commerce')
    .first<{ total: number }>();

  if ((existingNsAgents?.total ?? 0) === 0) {
    await db
      .prepare(
        `INSERT INTO support_agents
           (id, organization_id, display_name, email, role, specialty, availability, created_at, updated_at)
         VALUES (?, 'org_northstar_commerce', 'Elena Rostova', 'elena@northstar-commerce.example', 'supervisor', 'Fulfillment & Carrier Claims', 'available', ?, ?)`
      )
      .bind('agt_ns_elena', now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, customer_external_ref, channel, status, priority, category, subject, assigned_agent_name, diagnostic_summary, created_at, updated_at)
         VALUES (?, 'org_northstar_commerce', 'Marcus Vance', 'marcus.vance@buyer.example', 'NS-ORD-40918', 'portal', 'open', 'normal', 'Orders & Shipping', 'Carrier scan pending after 48 hours on order NS-ORD-40918', 'Elena Rostova', 'Guided path: Orders & Shipping -> No carrier scan after 48 hours.', ?, ?)`
      )
      .bind('conv_ns_seed_1', now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
         VALUES (?, 'conv_ns_seed_1', 'org_northstar_commerce', 'customer', 'Marcus Vance', 'Order NS-ORD-40918 was marked dispatched two days ago—could you check the regional carrier handoff?', ?)`
      )
      .bind('msg_ns_seed_1a', now)
      .run();
  }
}
