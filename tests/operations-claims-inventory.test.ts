import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapKnowledgeD1Schema,
  D1OperationsManagementService,
  type OperationsActorContext,
} from '@careflow/database/d1';
import { NodeSqliteD1Adapter } from '@careflow/database/sqlite-node';
import {
  EscalationPriority,
  UserRole,
} from '@careflow/shared';

describe('CustomCare Operations, Claims, Supervisor Verification, Replacement Inventory & Analytics (Tests 1-12)', () => {
  let db: NodeSqliteD1Adapter;
  let opsService: D1OperationsManagementService;
  const orgAlpha = 'org_alpha_ops';
  const orgBeta = 'org_beta_ops';

  const adminActor: OperationsActorContext = {
    userId: 'usr_admin_1',
    userName: 'Elena Vance (Admin)',
    userEmail: 'elena@alpha.io',
    userRole: UserRole.Admin,
  };

  const supervisorActor: OperationsActorContext = {
    userId: 'usr_sup_1',
    userName: 'Marcus Sterling (Supervisor)',
    userEmail: 'marcus@alpha.io',
    userRole: UserRole.Supervisor,
  };

  const agentActor1: OperationsActorContext = {
    userId: 'usr_agent_1',
    userName: 'Sarah Jenkins',
    userEmail: 'sarah@alpha.io',
    userRole: UserRole.Agent,
  };

  const agentActor2: OperationsActorContext = {
    userId: 'usr_agent_2',
    userName: 'Devon Brooks',
    userEmail: 'devon@alpha.io',
    userRole: UserRole.Agent,
  };

  const customerActor: OperationsActorContext = {
    userId: 'cust_portal_1',
    userName: 'Liam Carter',
    userEmail: 'liam@customer.org',
    userRole: UserRole.Customer,
  };

  beforeEach(async () => {
    db = new NodeSqliteD1Adapter(':memory:');
    await bootstrapKnowledgeD1Schema(db);
    opsService = new D1OperationsManagementService(db, 'test-ops-master-secret-2026');

    const now = new Date().toISOString();
    await db
      .prepare(`INSERT INTO organizations (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(orgAlpha, 'alpha-ops', 'Alpha Digital Commerce', now, now)
      .run();
    await db
      .prepare(`INSERT INTO organizations (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(orgBeta, 'beta-ops', 'Beta Cloud Services', now, now)
      .run();

    // Seed agents & supervisor in support_agents for orgAlpha
    await db
      .prepare(
        `INSERT INTO support_agents (id, organization_id, user_id, display_name, email, role, department, availability, membership_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Verification', 'available', 'active', ?, ?)`
      )
      .bind('ag_sup_1', orgAlpha, supervisorActor.userId, supervisorActor.userName, supervisorActor.userEmail, 'supervisor', now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_agents (id, organization_id, user_id, display_name, email, role, department, availability, membership_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Support', 'available', 'active', ?, ?)`
      )
      .bind('ag_1', orgAlpha, agentActor1.userId, agentActor1.userName, agentActor1.userEmail, 'agent', now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_agents (id, organization_id, user_id, display_name, email, role, department, availability, membership_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Support', 'available', 'active', ?, ?)`
      )
      .bind('ag_2', orgAlpha, agentActor2.userId, agentActor2.userName, agentActor2.userEmail, 'agent', now, now)
      .run();
  });

  it('TEST 1 & TEST 2: Customer/Agent Complaint Submission, Duplicate Order Detection, Encrypted Login Info & Internal Escalation', async () => {
    const categories = await opsService.listComplaintCategories(orgAlpha);
    assert.ok(categories.length >= 5, 'Default complaint categories should be seeded');

    const invalidLoginCat = categories.find((c) => c.slug === 'invalid-login-credentials')!;
    assert.ok(invalidLoginCat);

    // 1. Create first complaint with sensitive login credentials
    const complaint1 = await opsService.createComplaint(orgAlpha, agentActor1, {
      customerName: 'Liam Carter',
      customerEmail: 'liam@customer.org',
      orderId: 'ORD-99201',
      productOrService: 'Netflix 4K Ultra HD Annual',
      categoryId: invalidLoginCat.id,
      categoryName: invalidLoginCat.name,
      priority: EscalationPriority.High,
      description: 'Customer reports invalid password immediately after delivery.',
      loginInfo: 'liam_netflix@vault.io : SuperSecretPass99!',
      customFields: { error_message_seen: 'Incorrect password for this account' },
      evidenceItems: [
        {
          fileName: 'login-error-screenshot.png',
          mimeType: 'image/png',
          fileUrlOrData: 'https://example.com/evidence/err99201.png',
          description: 'Screenshot of sign-in failure prompt',
        },
      ],
    });

    assert.match(complaint1.referenceCode, /^CLM-\d{4}-[A-Z0-9]+$/);
    assert.equal(complaint1.status, 'submitted');
    assert.equal(complaint1.isPotentialDuplicate, false);
    assert.equal(complaint1.hasEncryptedLoginInfo, true);
    assert.ok(!complaint1.loginInfoMasked.includes('SuperSecretPass99!'), 'Masked preview must not expose raw password');
    assert.equal(complaint1.decryptedLoginInfo, undefined, 'General fetch must never return plaintext credentials');
    assert.equal(complaint1.evidence?.length, 1);

    // Authorized reveal of login info
    const revealed = await opsService.revealComplaintLoginCredentials(orgAlpha, complaint1.id, supervisorActor);
    assert.equal(revealed.loginInfo, 'liam_netflix@vault.io : SuperSecretPass99!');

    // 2. Submit a second complaint for the SAME Order ID -> must detect duplicate
    const duplicateComplaint = await opsService.createComplaint(orgAlpha, customerActor, {
      customerName: 'Liam Carter',
      customerEmail: 'liam@customer.org',
      orderId: 'ord-99201', // case-insensitive match
      productOrService: 'Netflix 4K Ultra HD Annual',
      categoryName: 'Invalid Login Credentials',
      description: 'Submitting again from customer portal',
    });

    assert.equal(duplicateComplaint.isPotentialDuplicate, true);
    assert.equal(duplicateComplaint.duplicateOfComplaintId, complaint1.id);
    assert.equal(duplicateComplaint.duplicateReferenceCode, complaint1.referenceCode);

    // 3. TEST 2: Agent escalates complaint1 to Supervisor Queue with internal note
    const escalated = await opsService.escalateComplaintToSupervisor(orgAlpha, complaint1.id, agentActor1, {
      priority: EscalationPriority.Urgent,
      escalationNote: 'Verified order payment #ORD-99201; credentials fail on test sign-in. Escalating for replacement approval.',
    });

    assert.equal(escalated.status, 'pending_review');
    assert.equal(escalated.priority, EscalationPriority.Urgent);
    assert.equal(escalated.assignedSupervisorName, supervisorActor.userName);

    const internalComments = escalated.comments || [];
    assert.ok(internalComments.some((c) => c.commentType === 'escalation_note' && !c.isVisibleToCustomer));
  });

  it('TEST 3 & TEST 4: Unauthorized Agent Approval Prevention, Supervisor Approval/Decline & Mandatory Decision Reason', async () => {
    const complaint = await opsService.createComplaint(orgAlpha, agentActor1, {
      customerName: 'Sophia Rossi',
      customerEmail: 'sophia@example.com',
      orderId: 'ORD-55010',
      productOrService: 'Spotify Duo 12M',
      categoryName: 'Unable to Access Purchased Account',
      description: 'Account locked out after region change.',
      escalateImmediately: true,
    });

    assert.equal(complaint.status, 'pending_review');

    // TEST 3: Support Agent attempts to approve or decline complaint -> MUST BE REJECTED
    await assert.rejects(
      async () => {
        await opsService.recordSupervisorDecision(orgAlpha, complaint.id, agentActor1, {
          decision: 'approved',
          reason: 'Agent trying to self-approve without supervisor role',
        });
      },
      /FORBIDDEN/i
    );

    // Supervisor attempts to approve WITHOUT a valid reason -> MUST BE REJECTED
    await assert.rejects(
      async () => {
        await opsService.recordSupervisorDecision(orgAlpha, complaint.id, supervisorActor, {
          decision: 'approved',
          reason: '  ',
        });
      },
      /VALIDATION_ERROR/i
    );

    // Supervisor moves to In Progress first
    const inProg = await opsService.recordSupervisorDecision(orgAlpha, complaint.id, supervisorActor, {
      decision: 'in_progress',
      reason: 'Starting credential verification with supplier logs',
    });
    assert.equal(inProg.status, 'in_progress');

    // Supervisor requests additional information -> status becomes awaiting_information
    const awaitingInfo = await opsService.recordSupervisorDecision(orgAlpha, complaint.id, supervisorActor, {
      decision: 'info_requested',
      reason: 'Please ask customer for exact country setting on their profile.',
    });
    assert.equal(awaitingInfo.status, 'awaiting_information');

    // Supervisor declines another fraudulent complaint
    const invalidComplaint = await opsService.createComplaint(orgAlpha, agentActor1, {
      customerName: 'Bad Actor',
      orderId: 'ORD-00000',
      productOrService: 'Spotify Duo 12M',
      description: 'Claiming replacement for an expired 2-year-old order.',
      escalateImmediately: true,
    });

    const declined = await opsService.recordSupervisorDecision(orgAlpha, invalidComplaint.id, supervisorActor, {
      decision: 'declined',
      reason: 'Order #ORD-00000 warranty period expired 14 months ago.',
    });
    assert.equal(declined.status, 'declined');
    assert.equal(declined.decision, 'declined');
    assert.equal(declined.decisionReason, 'Order #ORD-00000 warranty period expired 14 months ago.');
  });

  it('TEST 5, TEST 6, TEST 7 & TEST 8: Supervisor-Controlled vs Agent-Assisted Replacement Fulfilment, Stock Deduction & Concurrency Protection', async () => {
    // Create Inventory Category & Bulk Import Stock
    const invCat = await opsService.upsertInventoryCategory(orgAlpha, adminActor, {
      name: 'Adobe Creative Cloud 1Y Stock',
      productOrService: 'Adobe Creative Cloud Pro',
      description: 'Verified replacement licenses for Adobe CC',
      minStockThreshold: 2,
    });

    const stockRes = await opsService.addReplacementStock(orgAlpha, adminActor, {
      categoryId: invCat.id,
      batchCode: 'BATCH-ADOBE-01',
      supplierRef: 'SUP-ADOBE-DIST',
      notes: 'Initial 3 licenses',
      credentialsList: [
        'adobe_slot_1@licensed.io | PassSlot1#2026',
        'adobe_slot_2@licensed.io | PassSlot2#2026',
        'adobe_slot_3@licensed.io | PassSlot3#2026',
      ],
    });

    assert.equal(stockRes.addedItems.length, 3);
    const [item1, item2] = stockRes.addedItems;
    assert.ok(item1 && item2);

    // Verify listInventoryItems masks credentials
    const allItems = await opsService.listInventoryItems(orgAlpha);
    assert.equal(allItems.length, 3);
    for (const item of allItems) {
      assert.ok(!item.identifierMasked.includes('PassSlot'), 'Inventory list must never expose raw password');
    }

    // =========================================================================
    // TEST 5: METHOD 1 (Supervisor-Controlled Replacement Allocation)
    // =========================================================================
    const claimMethod1 = await opsService.createComplaint(orgAlpha, agentActor1, {
      customerName: 'Noah Williams',
      customerEmail: 'noah@creative.io',
      orderId: 'ORD-ADOBE-101',
      productOrService: 'Adobe Creative Cloud Pro',
      description: 'License key already redeemed prior to purchase.',
      escalateImmediately: true,
    });

    // Supervisor approves AND directly allocates item1 in one atomic step
    const approvedMethod1 = await opsService.recordSupervisorDecision(orgAlpha, claimMethod1.id, supervisorActor, {
      decision: 'approved',
      reason: 'Confirmed key redemption timestamp preceded customer purchase. Allocating replacement.',
      authorizeReplacement: true,
      replacementInventoryItemId: item1.id,
    });

    assert.equal(approvedMethod1.allocatedReplacementId, item1.id);
    assert.equal(approvedMethod1.allocatedReplacementStatus, 'RESERVED');

    // Agent retrieves decrypted replacement credentials to deliver to customer
    const revealedReplacement1 = await opsService.revealAllocatedReplacementCredentials(
      orgAlpha,
      claimMethod1.id,
      agentActor1
    );
    assert.equal(revealedReplacement1.credentialsPlaintext, 'adobe_slot_1@licensed.io | PassSlot1#2026');

    // Agent confirms delivery -> Inventory becomes ISSUED, Complaint becomes RESOLVED
    const deliveredMethod1 = await opsService.confirmReplacementDelivery(orgAlpha, agentActor1, {
      complaintId: claimMethod1.id,
      deliveryNotes: 'Sent replacement credentials to Noah via support thread.',
    });
    assert.equal(deliveredMethod1.status, 'resolved');
    assert.equal(deliveredMethod1.allocatedReplacementStatus, 'ISSUED');

    // =========================================================================
    // TEST 6 & TEST 8: METHOD 2 (Agent-Assisted Replacement) + Concurrent Allocation Guard
    // =========================================================================
    const claimMethod2A = await opsService.createComplaint(orgAlpha, agentActor1, {
      customerName: 'Ava Patel',
      orderId: 'ORD-ADOBE-202',
      productOrService: 'Adobe Creative Cloud Pro',
      description: 'Activation server rejected credentials.',
      escalateImmediately: true,
    });

    const claimMethod2B = await opsService.createComplaint(orgAlpha, agentActor2, {
      customerName: 'Lucas Kim',
      orderId: 'ORD-ADOBE-203',
      productOrService: 'Adobe Creative Cloud Pro',
      description: 'Missing profile PIN.',
      escalateImmediately: true,
    });

    // Supervisor approves both complaints for replacement without pre-selecting stock -> status = awaiting_replacement
    const supApproved2A = await opsService.recordSupervisorDecision(orgAlpha, claimMethod2A.id, supervisorActor, {
      decision: 'approved',
      reason: 'Approved for agent-assisted replacement selection.',
      authorizeReplacement: true,
    });
    const supApproved2B = await opsService.recordSupervisorDecision(orgAlpha, claimMethod2B.id, supervisorActor, {
      decision: 'approved',
      reason: 'Approved for agent-assisted replacement selection.',
      authorizeReplacement: true,
    });

    assert.equal(supApproved2A.status, 'awaiting_replacement');
    assert.equal(supApproved2B.status, 'awaiting_replacement');

    // Agent 1 allocates item2 for claimMethod2A -> succeeds
    const allocA = await opsService.allocateReplacementForComplaint(orgAlpha, agentActor1, {
      complaintId: claimMethod2A.id,
      inventoryItemId: item2.id,
      notes: 'Agent 1 reserving item2 for Ava Patel',
    });
    assert.equal(allocA.inventoryItem.status, 'RESERVED');

    // TEST 8: Agent 2 attempts to allocate the SAME item2 for claimMethod2B -> MUST FAIL WITH CONFLICT
    await assert.rejects(
      async () => {
        await opsService.allocateReplacementForComplaint(orgAlpha, agentActor2, {
          complaintId: claimMethod2B.id,
          inventoryItemId: item2.id,
          notes: 'Agent 2 attempting concurrent allocation of item2',
        });
      },
      /CONFLICT/i
    );

    // Agent 1 completes delivery for claimMethod2A
    const delivered2A = await opsService.confirmReplacementDelivery(orgAlpha, agentActor1, {
      complaintId: claimMethod2A.id,
      deliveryNotes: 'Delivered item2 to Ava Patel.',
    });
    assert.equal(delivered2A.status, 'resolved');

    // TEST 7: Verify Stock Deduction & Low Stock Threshold Alert
    const updatedCategories = await opsService.listInventoryCategories(orgAlpha);
    const updatedAdobeCat = updatedCategories.find((c) => c.id === invCat.id)!;
    assert.equal(updatedAdobeCat.issuedCount, 2);
    assert.equal(updatedAdobeCat.availableCount, 1); // 3 added - 2 issued = 1 available
    assert.equal(updatedAdobeCat.isLowStock, true); // availableCount (1) <= minStockThreshold (2)

    const movements = await opsService.listInventoryMovements(orgAlpha);
    assert.ok(movements.some((m) => m.movementType === 'issued' && m.complaintId === claimMethod1.id));
    assert.ok(movements.some((m) => m.movementType === 'issued' && m.complaintId === claimMethod2A.id));
  });

  it('TEST 9, TEST 10, TEST 11 & TEST 12: Meaningful Agent Activity, Operations Dashboard Metrics, Closing Report & Multi-Business Isolation', async () => {
    const now = new Date().toISOString();

    // Seed 2 conversations in orgAlpha:
    // - Conv 1: Assigned to Agent 1 AND Agent 1 actually replies -> handled = 1, assigned = 1
    // - Conv 2: Assigned to Agent 2, but Agent 2 sends NO reply -> handled = 0, assigned = 1
    await db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, subject, status, priority, category, channel, assigned_agent_id, assigned_agent_name, escalation_count, created_at, updated_at)
         VALUES ('conv_ops_1', ?, 'Mia Wallace', 'mia@wallace.io', 'Order #ORD-771 Login Help', 'open', 'high', 'Account', 'portal', ?, ?, 0, ?, ?)`
      )
      .bind(orgAlpha, agentActor1.userId, agentActor1.userName, now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, is_internal_note, delivery_status, created_at)
         VALUES ('msg_ops_1', 'conv_ops_1', ?, 'customer', 'Mia Wallace', 'Hi, I need help signing into my new subscription.', 0, 'delivered', ?)`
      )
      .bind(orgAlpha, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, sender_user_id, body, is_internal_note, delivery_status, created_at)
         VALUES ('msg_ops_2', 'conv_ops_1', ?, 'agent', ?, ?, 'Hello Mia! I am checking your order #ORD-771 right now.', 0, 'delivered', ?)`
      )
      .bind(orgAlpha, agentActor1.userName, agentActor1.userId, now)
      .run();

    await opsService.recordMeaningfulAgentAction(
      orgAlpha,
      agentActor1,
      'conversation_reply',
      'Replied to conv_ops_1'
    );

    await db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, subject, status, priority, category, channel, assigned_agent_id, assigned_agent_name, escalation_count, created_at, updated_at)
         VALUES ('conv_ops_2', ?, 'Vincent Vega', 'vincent@vega.io', 'Billing question', 'open', 'normal', 'Billing', 'portal', ?, ?, 0, ?, ?)`
      )
      .bind(orgAlpha, agentActor2.userId, agentActor2.userName, now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, is_internal_note, delivery_status, created_at)
         VALUES ('msg_ops_3', 'conv_ops_2', ?, 'customer', 'Vincent Vega', 'Can I get an invoice for my purchase?', 0, 'delivered', ?)`
      )
      .bind(orgAlpha, now)
      .run();

    // TEST 9 & TEST 10: Verify Dashboard Metrics accurately distinguish assigned vs handled conversations and active vs inactive agents
    const dashboard = await opsService.getOperationsDashboardMetrics(orgAlpha, {
      preset: 'last_30_days',
    });

    assert.ok(dashboard.overview.newConversations >= 2);
    assert.ok(dashboard.overview.totalConversationsHandled >= 1);
    assert.ok(dashboard.overview.uniqueCustomersAttended >= 1);

    const perfAgent1 = dashboard.agentPerformance.find((a) => a.userId === agentActor1.userId)!;
    const perfAgent2 = dashboard.agentPerformance.find((a) => a.userId === agentActor2.userId)!;

    assert.ok(perfAgent1);
    assert.equal(perfAgent1.assignedConversations, 1);
    assert.equal(perfAgent1.conversationsHandled, 1);
    assert.equal(perfAgent1.uniqueCustomersAttended, 1);
    assert.equal(perfAgent1.activityStatus, 'actively_working');

    assert.ok(perfAgent2);
    assert.equal(perfAgent2.assignedConversations, 1);
    assert.equal(perfAgent2.conversationsHandled, 0, 'Assigned conversation without reply must not count as handled');
    assert.equal(perfAgent2.activityStatus, 'inactive');

    // TEST 11: Generate Daily Closing Report from actual database records
    const closingReport = await opsService.generateClosingReport(orgAlpha, {
      period: 'daily',
    });
    assert.equal(closingReport.organizationName, 'Alpha Digital Commerce');
    assert.ok(closingReport.summary.conversationsReceived >= 2);
    assert.ok(closingReport.agentActivitySummary.some((a) => a.agentName === agentActor1.userName));
    assert.ok(closingReport.observations.length >= 1);

    // TEST 12: Multi-Business Isolation (orgBeta must see ZERO complaints, inventory, or timeline events from orgAlpha)
    const betaComplaints = await opsService.listComplaints(orgBeta);
    const betaInventory = await opsService.listInventoryItems(orgBeta);
    const betaTimeline = await opsService.listOperationalTimeline(orgBeta);

    assert.equal(betaComplaints.length, 0, 'orgBeta must not access orgAlpha complaints');
    assert.equal(betaInventory.length, 0, 'orgBeta must not access orgAlpha replacement inventory');
    assert.equal(betaTimeline.length, 0, 'orgBeta must not access orgAlpha operational timeline');
  });

  it('TEST 13 & TEST 14: Specialised Personnel Routing, QA Evaluations, Agent Scorecards & Customer CSAT Feedback', async () => {
    const claim = await opsService.createComplaint(orgAlpha, agentActor1, {
      customerName: 'Chidi Obi',
      customerEmail: 'chidi@fintech.ng',
      orderId: 'DEP-2026-8801',
      productOrService: 'Wallet Deposit ($250.00)',
      categoryName: 'Deposit & Payment Verification',
      priority: EscalationPriority.Urgent,
      description: 'Customer bank transfer debited but wallet balance not credited.',
      assignedAgentId: agentActor1.userId,
      assignedAgentName: agentActor1.userName,
      escalateImmediately: true,
    });

    assert.ok(claim.slaDeadlineAt, 'Complaint must compute an SLA deadline upon creation');

    // Route from Supervisor to Specialised Personnel (Treasury & Deposit Reconciliation)
    const routedToSpecialist = await opsService.reassignComplaint(
      orgAlpha,
      claim.id,
      supervisorActor,
      {
        assignmentRole: 'specialist',
        toUserId: 'usr_specialist_treasury_1',
        toUserName: 'Adaeze Okafor (Treasury Specialist)',
        specialistDepartment: 'Treasury & Deposit Reconciliation',
        reason: 'Assigning to Treasury Specialist to reconcile gateway settlement batch.',
      }
    );

    assert.equal(
      routedToSpecialist.assignedSpecialistName,
      'Adaeze Okafor (Treasury Specialist)'
    );
    assert.equal(
      routedToSpecialist.assignedSpecialistDepartment,
      'Treasury & Deposit Reconciliation'
    );
    assert.equal(routedToSpecialist.status, 'in_progress');
    assert.ok(
      routedToSpecialist.assignmentHistory?.some((h) => h.assignmentRole === 'specialist'),
      'Assignment history must record specialist handoff'
    );

    // Record Supervisor QA Evaluation for Agent 1
    const qaEval = await opsService.createQaEvaluation(orgAlpha, supervisorActor, {
      complaintId: claim.id,
      caseReference: claim.referenceCode,
      agentId: agentActor1.userId,
      agentName: agentActor1.userName,
      accuracyScore: 5,
      professionalismScore: 5,
      resolutionEffectivenessScore: 4,
      caseComplexity: 'complex',
      feedbackNotes: 'Thorough intake and receipt verification before escalating.',
      coachingRecommendations: 'Continue attaching transaction reference IDs in escalation notes.',
    });

    assert.equal(qaEval.overallScore, 93);
    assert.equal(qaEval.caseComplexity, 'complex');

    // Submit Customer CSAT Feedback
    const csat = await opsService.submitCustomerFeedback(orgAlpha, {
      complaintId: claim.id,
      caseReference: claim.referenceCode,
      customerName: 'Chidi Obi',
      customerEmail: 'chidi@fintech.ng',
      rating: 5,
      comment: 'Fast reconciliation by the Treasury team!',
    });
    assert.equal(csat.rating, 5);

    // Verify Agent Scorecards & Dashboard CSAT aggregation
    const scorecards = await opsService.getAgentScorecards(orgAlpha);
    const sarahCard = scorecards.find((s) => s.userId === agentActor1.userId)!;
    assert.ok(sarahCard, 'Agent scorecard must be generated for Sarah Jenkins');
    assert.equal(sarahCard.qaEvaluationsCount, 1);
    assert.equal(sarahCard.avgQaScore, 93);
    assert.equal(sarahCard.avgCsatScore, 5);

    const metrics = await opsService.getOperationsDashboardMetrics(orgAlpha, {
      preset: 'today',
    });
    assert.equal(metrics.overview.customerSatisfactionScore, 5);
    assert.equal(metrics.backlogQueues.casesAwaitingSpecialisedPersonnel, 1);
  });

  it('TEST 15 & TEST 16: Configurable Workflow Automation Engine (Loop-Deduplicated) & 10-Step [DEMO] Deposit Scenario', async () => {
    // Seed an unassigned open conversation so auto_assign_enquiry + auto_categorise_enquiry trigger
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, subject, status, priority, category, channel, escalation_count, created_at, updated_at)
         VALUES ('conv_auto_1', ?, 'Zainab Bello', 'zainab@client.org', 'Urgent deposit payment receipt missing', 'open', 'high', 'General', 'web_chat', 0, ?, ?)`
      )
      .bind(orgAlpha, now, now)
      .run();

    const rules = await opsService.listAutomationRules(orgAlpha);
    assert.equal(rules.length, 8, 'All 8 default workflow automation rules must be seeded');

    // First sweep triggers actions on conv_auto_1
    const firstSweep = await opsService.runAutomationRulesSweep(orgAlpha, adminActor);
    assert.ok(firstSweep.executedActionsCount >= 2, 'First sweep should auto-assign and auto-categorise conv_auto_1');

    // Second immediate sweep on the exact same unchanged state must trigger 0 duplicate actions (loop guard)
    const secondSweep = await opsService.runAutomationRulesSweep(orgAlpha, adminActor);
    assert.equal(
      secondSweep.executedActionsCount,
      0,
      'Workflow automation loop guard must prevent duplicate execution on unchanged records'
    );

    // TEST 16: Run the 10-step [DEMO] Customer Deposit Complaint Scenario
    const demoResult = await opsService.seedDemonstrationScenario(orgAlpha, adminActor);
    assert.match(demoResult.demoReferenceCode, /^CLM-\d{4}-[A-Z0-9]+$/);
    assert.equal(demoResult.stepsCompleted.length, 10);

    const demoComplaint = await opsService.getComplaintDetail(orgAlpha, demoResult.complaintId);
    assert.ok(demoComplaint);
    assert.equal(demoComplaint.status, 'resolved');
    assert.ok(demoComplaint.customerName.includes('[DEMO]'));
    assert.equal(
      demoComplaint.assignedSpecialistDepartment,
      'Treasury & Deposit Reconciliation'
    );
  });
});

