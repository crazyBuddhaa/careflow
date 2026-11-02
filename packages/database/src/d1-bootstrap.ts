import {
  KNOWLEDGE_D1_SCHEMA_STATEMENTS,
  type D1DatabaseLike,
} from './d1-types';
import {
  NORTHSTAR_COMMERCE_PRESET,
  ULTIMATE_TECH_APP_PRESET,
} from './d1-portal-presets';

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

  // Seed default portal settings for UltimateTechApp and Northstar Commerce if absent
  await db
    .prepare(
      `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (organization_id) DO NOTHING`
    )
    .bind('org_ultimatetechapp', JSON.stringify(ULTIMATE_TECH_APP_PRESET), now)
    .run();

  await db
    .prepare(
      `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (organization_id) DO NOTHING`
    )
    .bind('org_northstar_commerce', JSON.stringify(NORTHSTAR_COMMERCE_PRESET), now)
    .run();

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

  // Seed starter support specialists & sample isolated conversations if none exist yet
  const existingAgentsCount = await db
    .prepare(`SELECT COUNT(*) AS total FROM support_agents WHERE organization_id = ?`)
    .bind('org_ultimatetechapp')
    .first<{ total: number }>();

  if ((existingAgentsCount?.total ?? 0) === 0) {
    await db
      .prepare(
        `INSERT INTO support_agents
           (id, organization_id, display_name, email, role, specialty, availability, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'agt_uta_amara',
        'org_ultimatetechapp',
        'Amara Okafor',
        'amara.okafor@ultimatetechapp.example',
        'supervisor',
        'Deposit Verification & Escalations',
        'available',
        now,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO support_agents
           (id, organization_id, display_name, email, role, specialty, availability, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'agt_uta_daniel',
        'org_ultimatetechapp',
        'Daniel Mensah',
        'daniel.mensah@ultimatetechapp.example',
        'agent',
        'Product Workspaces & Onboarding',
        'available',
        now,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, customer_external_ref, channel, status, priority, category, subject, assigned_agent_name, diagnostic_summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'portal', 'escalated', 'high', 'Deposit Assistance', ?, 'Amara Okafor', ?, ?, ?)`
      )
      .bind(
        'conv_uta_seed_1',
        'org_ultimatetechapp',
        'Tunde Adeyemi',
        'tunde.adeyemi@customer.example',
        'UTA-ACC-88412',
        'Transfer sent with truncated reference string',
        'Guided path: Deposit Assistance -> Balance not updated -> Escalated to human specialist.',
        now,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
         VALUES (?, 'conv_uta_seed_1', 'org_ultimatetechapp', 'system', 'CareFlow Handoff Context', ?, ?)`
      )
      .bind(
        'msg_uta_seed_1a',
        'Customer completed Deposit Assistance checklist and requested human verification.',
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
         VALUES (?, 'conv_uta_seed_1', 'org_ultimatetechapp', 'customer', 'Tunde Adeyemi', ?, ?)`
      )
      .bind(
        'msg_uta_seed_1b',
        'Hi team, my bank receipt shows reference TRX-992014 but my profile ID ends in 88412. Can you verify my transfer?',
        now
      )
      .run();

    await db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, customer_external_ref, channel, status, priority, category, subject, assigned_agent_name, diagnostic_summary, created_at, updated_at)
         VALUES (?, 'org_ultimatetechapp', 'Chioma Nwosu', 'chioma.nwosu@customer.example', 'UTA-ACC-51904', 'web_widget', 'resolved', 'normal', 'Product Support', 'Completed required workspace configuration steps', 'Daniel Mensah', 'Guided path: Product Support -> Core workspace steps.', ?, ?)`
      )
      .bind('conv_uta_seed_2', now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
         VALUES (?, 'conv_uta_seed_2', 'org_ultimatetechapp', 'customer', 'Chioma Nwosu', 'The Continue button in my workspace was disabled until I filled out the settlement currency field—all sorted now!', ?)`
      )
      .bind('msg_uta_seed_2a', now)
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
