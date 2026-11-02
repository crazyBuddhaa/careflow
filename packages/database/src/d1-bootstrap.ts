import {
  KNOWLEDGE_D1_SCHEMA_STATEMENTS,
  type D1DatabaseLike,
} from './d1-types';

const DEFAULT_TENANTS = [
  {
    id: 'org_ultimatetechapp',
    slug: 'ultimatetechapp',
    name: 'UltimateTechApp',
  },
  {
    id: 'org_northstar_commerce',
    slug: 'northstar-commerce',
    name: 'Northstar Commerce',
  },
];

const INITIAL_ULTIMATE_CATEGORIES = [
  {
    id: 'cat_uta_deposits',
    slug: 'deposits',
    name: 'Deposits',
    description: 'Deposit confirmations, reference checks, and missing balances.',
    displayOrder: 10,
  },
  {
    id: 'cat_uta_products',
    slug: 'products-and-services',
    name: 'Products and Services',
    description: 'How to navigate workspaces and use product features accurately.',
    displayOrder: 20,
  },
  {
    id: 'cat_uta_account',
    slug: 'account-assistance',
    name: 'Account Assistance',
    description: 'Profile settings, access management, and account enquiries.',
    displayOrder: 30,
  },
  {
    id: 'cat_uta_troubleshooting',
    slug: 'troubleshooting',
    name: 'Troubleshooting',
    description: 'Resolving common technical or session issues.',
    displayOrder: 40,
  },
];

/**
 * Ensures the SQLite/D1 schema and base organizations exist.
 * Uses statement-by-statement `db.prepare(sql).run()` so initialization works
 * identically on Cloudflare Workers D1 (`env.DB`) and local Node SQLite.
 */
export async function bootstrapKnowledgeD1Schema(db: D1DatabaseLike): Promise<void> {
  for (const statement of KNOWLEDGE_D1_SCHEMA_STATEMENTS) {
    await db.prepare(statement).run();
  }

  const now = new Date().toISOString();

  for (const org of DEFAULT_TENANTS) {
    await db
      .prepare(
        `INSERT INTO organizations (id, slug, name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT (id) DO NOTHING`
      )
      .bind(org.id, org.slug, org.name, now, now)
      .run();
  }

  // Seed initial UltimateTechApp categories & starter records only if none exist yet
  const existingUtaCatCount = await db
    .prepare(`SELECT COUNT(*) as total FROM knowledge_categories WHERE organization_id = ?`)
    .bind('org_ultimatetechapp')
    .first<{ total: number }>();

  if ((existingUtaCatCount?.total ?? 0) === 0) {
    for (const cat of INITIAL_ULTIMATE_CATEGORIES) {
      await db
        .prepare(
          `INSERT INTO knowledge_categories
             (id, organization_id, slug, name, description, display_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          cat.id,
          'org_ultimatetechapp',
          cat.slug,
          cat.name,
          cat.description,
          cat.displayOrder,
          now,
          now
        )
        .run();
    }

    await db
      .prepare(
        `INSERT INTO knowledge_articles
           (id, organization_id, category_id, slug, title, short_description, content, tags_json, status, search_keywords, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'art_uta_deposit_checklist',
        'org_ultimatetechapp',
        'cat_uta_deposits',
        'verifying-deposit-references',
        'Verifying Deposit References and Payment Receipts',
        'Step-by-step checklist for matching your payment reference with your UltimateTechApp account.',
        'Before requesting a manual deposit check, confirm that your payment receipt or transaction reference matches the account identifier displayed in your workspace.\n\n1. Locate your payment confirmation receipt.\n2. Verify that the account identifier matches your registered profile.\n3. Keep the reference string ready when contacting support.',
        JSON.stringify(['deposits', 'payments', 'verification']),
        'published',
        'verifying deposit references payment receipts balance confirmation checklist account',
        now,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO knowledge_articles
           (id, organization_id, category_id, slug, title, short_description, content, tags_json, status, search_keywords, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'art_uta_product_onboarding',
        'org_ultimatetechapp',
        'cat_uta_products',
        'using-product-workspaces',
        'Using Product Workspaces Correctly',
        'Overview of core workspace controls and required configuration fields.',
        'Each product workspace guides you through required configuration fields in order.\n\nEnsure every required field is completed before advancing to the next step. If an action button appears disabled, check for incomplete fields highlighted on the current panel.',
        JSON.stringify(['products', 'workspace', 'guide']),
        'published',
        'using product workspaces guide configuration fields steps controls',
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
        'faq_uta_deposit_1',
        'org_ultimatetechapp',
        'cat_uta_deposits',
        'What information should I prepare if my deposit balance has not updated?',
        'Have your payment confirmation receipt and transaction reference ready, and confirm they match your account details before escalating to a human representative.',
        'published',
        'what information prepare deposit balance not updated payment receipt reference',
        10,
        now,
        now
      )
      .run();
  }

  // Seed Northstar Commerce with distinct categories to demonstrate strict multi-business isolation
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
}
