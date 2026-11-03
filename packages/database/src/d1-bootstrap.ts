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
  ];
  for (const alterSql of schemaAlterations) {
    try {
      await db.prepare(alterSql).run();
    } catch {
      // Column already exists or already upgraded
    }
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
