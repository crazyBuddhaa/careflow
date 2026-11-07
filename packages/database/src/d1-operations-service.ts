import { randomBytes } from 'node:crypto';
import {
  ConversationStatus,
  EscalationPriority,
  MessageSenderType,
  UserRole,
  type ClaimDecisionType,
  type ClaimStatus,
  type ComplaintAssignmentHistoryRecord,
  type ComplaintCategoryRecord,
  type ComplaintCommentType,
  type ComplaintCustomFieldDefinition,
  type ComplaintEvidenceRecord,
  type ComplaintInternalCommentRecord,
  type DailyClosingReportDto,
  type DailyOperationsMetricsDto,
  type InventoryMovementType,
  type OperationalActivityCategory,
  type OperationalActivityEventRecord,
  type OperationsDatePreset,
  type OrganizationOperationsConfig,
  type ReplacementFulfilmentMethod,
  type ReplacementInventoryCategoryRecord,
  type ReplacementInventoryItemRecord,
  type ReplacementInventoryMovementRecord,
  type ReplacementInventoryStatus,
  type ReplacementStockBatchRecord,
  type SupportComplaintRecord,
} from '@careflow/shared';
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
} from './d1-channel-service';
import type { D1DatabaseLike } from './d1-types';

function createOpsId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function generateComplaintReferenceCode(): string {
  const year = new Date().getUTCFullYear();
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `CLM-${year}-${rand}`;
}

/**
 * Masks sensitive credentials or login details so plaintext secrets are never exposed
 * in general list queries, audit logs, or notifications.
 */
export function maskSensitiveCredentialString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() || '';
  if (firstLine.includes('@')) {
    const [userPart, rest] = firstLine.split('@');
    const safeUser =
      userPart && userPart.length > 2
        ? `${userPart.slice(0, 2)}***`
        : '***';
    const domainPart = rest?.split(/[\s:/|]+/)[0] || 'account';
    return `${safeUser}@${domainPart} · [Encrypted]`;
  }
  if (firstLine.length <= 6) {
    return `${firstLine.slice(0, 1)}*** · [Encrypted]`;
  }
  return `${firstLine.slice(0, 4)}***${firstLine.slice(-2)} · [Encrypted]`;
}

export interface OperationsActorContext {
  userId: string;
  userName: string;
  userEmail?: string;
  userRole: UserRole;
  permissions?: string[];
}

const DEFAULT_COMPLAINT_CATEGORIES: Array<{
  slug: string;
  name: string;
  description: string;
  requiresOrderId: boolean;
  requiresLoginInfo: boolean;
  requiresEvidence: boolean;
  defaultPriority: EscalationPriority;
  autoEscalateToSupervisor: boolean;
  displayOrder: number;
  customFields: ComplaintCustomFieldDefinition[];
}> = [
  {
    slug: 'invalid-login-credentials',
    name: 'Invalid Login Credentials',
    description: 'Credentials provided for a purchased account or service do not authenticate.',
    requiresOrderId: true,
    requiresLoginInfo: true,
    requiresEvidence: false,
    defaultPriority: EscalationPriority.High,
    autoEscalateToSupervisor: false,
    displayOrder: 10,
    customFields: [
      {
        key: 'error_message_seen',
        label: 'Exact Error Message Shown',
        type: 'text',
        required: false,
      },
    ],
  },
  {
    slug: 'incomplete-login-information',
    name: 'Incomplete Login Information',
    description: 'Missing username, password, profile pin, or setup instructions on delivery.',
    requiresOrderId: true,
    requiresLoginInfo: false,
    requiresEvidence: false,
    defaultPriority: EscalationPriority.Normal,
    autoEscalateToSupervisor: false,
    displayOrder: 20,
    customFields: [
      {
        key: 'missing_fields',
        label: 'Missing Credential Fields',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    slug: 'unable-to-access-purchased-account',
    name: 'Unable to Access Purchased Account',
    description: 'Customer is locked out, prompted for verification code, or unable to sign in.',
    requiresOrderId: true,
    requiresLoginInfo: true,
    requiresEvidence: true,
    defaultPriority: EscalationPriority.High,
    autoEscalateToSupervisor: false,
    displayOrder: 30,
    customFields: [],
  },
  {
    slug: 'incorrect-product-or-service',
    name: 'Incorrect Product or Service Delivered',
    description: 'Delivered item or subscription tier does not match the customer order.',
    requiresOrderId: true,
    requiresLoginInfo: false,
    requiresEvidence: true,
    defaultPriority: EscalationPriority.Normal,
    autoEscalateToSupervisor: false,
    displayOrder: 40,
    customFields: [
      {
        key: 'expected_product',
        label: 'Expected Product / Tier',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    slug: 'product-not-functioning',
    name: 'Product Not Functioning as Expected',
    description: 'Service interruption, connection failure, or degraded product functionality.',
    requiresOrderId: true,
    requiresLoginInfo: true,
    requiresEvidence: false,
    defaultPriority: EscalationPriority.High,
    autoEscalateToSupervisor: false,
    displayOrder: 50,
    customFields: [
      {
        key: 'device_or_platform',
        label: 'Device / OS Platform',
        type: 'text',
        required: false,
      },
    ],
  },
];

export class D1OperationsManagementService {
  private readonly encryptionSecret?: string;

  constructor(
    private readonly db: D1DatabaseLike,
    encryptionSecretOrOptions?:
      | string
      | { encryptionKey?: string; encryptionSecret?: string }
  ) {
    if (typeof encryptionSecretOrOptions === 'string') {
      this.encryptionSecret = encryptionSecretOrOptions;
    } else if (encryptionSecretOrOptions && typeof encryptionSecretOrOptions === 'object') {
      this.encryptionSecret =
        encryptionSecretOrOptions.encryptionKey ||
        encryptionSecretOrOptions.encryptionSecret;
    }
  }

  /* ==========================================================================
     1. BUSINESS OPERATIONS CONFIGURATION & DEFAULT CATEGORY SEEDING
  ========================================================================== */

  async getOperationsConfig(organizationId: string): Promise<OrganizationOperationsConfig> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO organization_operations_configs
           (organization_id, timezone, business_closing_time, fulfilment_method, allow_agent_direct_approval, auto_assign_supervisor, sla_first_response_minutes, sla_resolution_hours, sla_overdue_hours, inactivity_timeout_minutes, updated_at)
         VALUES (?, 'UTC', '18:00', 'both', 0, 1, 30, 24, 48, 15, ?)
         ON CONFLICT (organization_id) DO NOTHING`
      )
      .bind(organizationId, now)
      .run();

    const row = await this.db
      .prepare(`SELECT * FROM organization_operations_configs WHERE organization_id = ?`)
      .bind(organizationId)
      .first<Record<string, unknown>>();

    return {
      organizationId,
      timezone: String(row?.timezone || 'UTC'),
      businessClosingTime: String(row?.business_closing_time || '18:00'),
      fulfilmentMethod:
        (row?.fulfilment_method as ReplacementFulfilmentMethod) || 'both',
      allowAgentDirectApproval: Number(row?.allow_agent_direct_approval ?? 0) === 1,
      autoAssignSupervisor: Number(row?.auto_assign_supervisor ?? 1) === 1,
      slaFirstResponseMinutes: Number(row?.sla_first_response_minutes ?? 30),
      slaResolutionHours: Number(row?.sla_resolution_hours ?? 24),
      slaOverdueHours: Number(row?.sla_overdue_hours ?? 48),
      inactivityTimeoutMinutes: Number(row?.inactivity_timeout_minutes ?? 15),
      updatedAt: String(row?.updated_at || now),
    };
  }

  async updateOperationsConfig(
    organizationId: string,
    actor: OperationsActorContext,
    input: Partial<Omit<OrganizationOperationsConfig, 'organizationId' | 'updatedAt'>>
  ): Promise<OrganizationOperationsConfig> {
    if (actor.userRole !== UserRole.Owner && actor.userRole !== UserRole.Admin) {
      throw new Error('FORBIDDEN: Only workspace administrators can update operational settings.');
    }

    const current = await this.getOperationsConfig(organizationId);
    const now = new Date().toISOString();

    const next: OrganizationOperationsConfig = {
      organizationId,
      timezone: input.timezone?.trim() || current.timezone,
      businessClosingTime: input.businessClosingTime?.trim() || current.businessClosingTime,
      fulfilmentMethod: input.fulfilmentMethod ?? current.fulfilmentMethod,
      allowAgentDirectApproval:
        input.allowAgentDirectApproval ?? current.allowAgentDirectApproval,
      autoAssignSupervisor: input.autoAssignSupervisor ?? current.autoAssignSupervisor,
      slaFirstResponseMinutes:
        input.slaFirstResponseMinutes ?? current.slaFirstResponseMinutes,
      slaResolutionHours: input.slaResolutionHours ?? current.slaResolutionHours,
      slaOverdueHours: input.slaOverdueHours ?? current.slaOverdueHours,
      inactivityTimeoutMinutes:
        input.inactivityTimeoutMinutes ?? current.inactivityTimeoutMinutes,
      updatedAt: now,
    };

    await this.db
      .prepare(
        `UPDATE organization_operations_configs
         SET timezone = ?,
             business_closing_time = ?,
             fulfilment_method = ?,
             allow_agent_direct_approval = ?,
             auto_assign_supervisor = ?,
             sla_first_response_minutes = ?,
             sla_resolution_hours = ?,
             sla_overdue_hours = ?,
             inactivity_timeout_minutes = ?,
             updated_at = ?
         WHERE organization_id = ?`
      )
      .bind(
        next.timezone,
        next.businessClosingTime,
        next.fulfilmentMethod,
        next.allowAgentDirectApproval ? 1 : 0,
        next.autoAssignSupervisor ? 1 : 0,
        next.slaFirstResponseMinutes,
        next.slaResolutionHours,
        next.slaOverdueHours,
        next.inactivityTimeoutMinutes,
        now,
        organizationId
      )
      .run();

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'settings',
      eventType: 'operations_config_updated',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      summary: `${actor.userName} updated operational SLA & replacement fulfilment configuration (${next.fulfilmentMethod}).`,
      metadata: {
        fulfilmentMethod: next.fulfilmentMethod,
        allowAgentDirectApproval: next.allowAgentDirectApproval,
        timezone: next.timezone,
      },
    });

    return next;
  }

  async ensureDefaultComplaintCategories(organizationId: string): Promise<void> {
    if (organizationId === 'org_customcare_agent_hub') return;
    const countRow = await this.db
      .prepare(`SELECT COUNT(*) AS total FROM complaint_categories WHERE organization_id = ?`)
      .bind(organizationId)
      .first<{ total: number }>();

    if ((countRow?.total ?? 0) > 0) return;

    const now = new Date().toISOString();
    for (const preset of DEFAULT_COMPLAINT_CATEGORIES) {
      await this.db
        .prepare(
          `INSERT INTO complaint_categories
             (id, organization_id, slug, name, description, requires_order_id, requires_login_info, requires_evidence, custom_fields_json, default_priority, auto_escalate_to_supervisor, is_active, display_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT (organization_id, slug) DO NOTHING`
        )
        .bind(
          createOpsId('ccat'),
          organizationId,
          preset.slug,
          preset.name,
          preset.description,
          preset.requiresOrderId ? 1 : 0,
          preset.requiresLoginInfo ? 1 : 0,
          preset.requiresEvidence ? 1 : 0,
          JSON.stringify(preset.customFields),
          preset.defaultPriority,
          preset.autoEscalateToSupervisor ? 1 : 0,
          preset.displayOrder,
          now,
          now
        )
        .run();
    }
  }

  async listComplaintCategories(organizationId: string): Promise<ComplaintCategoryRecord[]> {
    await this.ensureDefaultComplaintCategories(organizationId);
    const { results } = await this.db
      .prepare(
        `SELECT * FROM complaint_categories
         WHERE organization_id = ?
         ORDER BY display_order ASC, name ASC`
      )
      .bind(organizationId)
      .all<Record<string, unknown>>();

    return results.map((r) => {
      let customFields: ComplaintCustomFieldDefinition[] = [];
      try {
        customFields = JSON.parse(String(r.custom_fields_json || '[]'));
      } catch {
        customFields = [];
      }
      return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        slug: String(r.slug),
        name: String(r.name),
        description: String(r.description || ''),
        requiresOrderId: Number(r.requires_order_id ?? 1) === 1,
        requiresLoginInfo: Number(r.requires_login_info ?? 0) === 1,
        requiresEvidence: Number(r.requires_evidence ?? 0) === 1,
        customFields,
        defaultPriority:
          (r.default_priority as EscalationPriority) || EscalationPriority.Normal,
        autoEscalateToSupervisor: Number(r.auto_escalate_to_supervisor ?? 0) === 1,
        isActive: Number(r.is_active ?? 1) === 1,
        displayOrder: Number(r.display_order ?? 10),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });
  }

  async upsertComplaintCategory(
    organizationId: string,
    actor: OperationsActorContext,
    input: {
      id?: string;
      name: string;
      description?: string;
      requiresOrderId?: boolean;
      requiresLoginInfo?: boolean;
      requiresEvidence?: boolean;
      customFields?: ComplaintCustomFieldDefinition[];
      defaultPriority?: EscalationPriority;
      autoEscalateToSupervisor?: boolean;
      isActive?: boolean;
    }
  ): Promise<ComplaintCategoryRecord> {
    if (actor.userRole !== UserRole.Owner && actor.userRole !== UserRole.Admin) {
      throw new Error('FORBIDDEN: Only administrators can configure complaint categories.');
    }

    const now = new Date().toISOString();
    const slug =
      input.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `cat-${Date.now()}`;

    const id = input.id || createOpsId('ccat');
    const customFieldsJson = JSON.stringify(input.customFields ?? []);

    await this.db
      .prepare(
        `INSERT INTO complaint_categories
           (id, organization_id, slug, name, description, requires_order_id, requires_login_info, requires_evidence, custom_fields_json, default_priority, auto_escalate_to_supervisor, is_active, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 25, ?, ?)
         ON CONFLICT (organization_id, slug) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           requires_order_id = excluded.requires_order_id,
           requires_login_info = excluded.requires_login_info,
           requires_evidence = excluded.requires_evidence,
           custom_fields_json = excluded.custom_fields_json,
           default_priority = excluded.default_priority,
           auto_escalate_to_supervisor = excluded.auto_escalate_to_supervisor,
           is_active = excluded.is_active,
           updated_at = excluded.updated_at`
      )
      .bind(
        id,
        organizationId,
        slug,
        input.name.trim(),
        input.description?.trim() || '',
        input.requiresOrderId !== false ? 1 : 0,
        input.requiresLoginInfo ? 1 : 0,
        input.requiresEvidence ? 1 : 0,
        customFieldsJson,
        input.defaultPriority || EscalationPriority.Normal,
        input.autoEscalateToSupervisor ? 1 : 0,
        input.isActive !== false ? 1 : 0,
        now,
        now
      )
      .run();

    const categories = await this.listComplaintCategories(organizationId);
    return categories.find((c) => c.slug === slug) ?? categories[0]!;
  }

  /* ==========================================================================
     2. CLAIMS & RESOLUTION MANAGEMENT (Customer -> Agent -> Supervisor -> Resolution)
  ========================================================================== */

  async createComplaint(
    organizationId: string,
    actor: OperationsActorContext,
    input: {
      conversationId?: string;
      ticketId?: string;
      customerId?: string;
      customerName: string;
      customerEmail?: string;
      orderId?: string;
      productOrService: string;
      categoryId?: string;
      categoryName?: string;
      priority?: EscalationPriority;
      description: string;
      loginInfo?: string;
      customFields?: Record<string, string>;
      assignedAgentId?: string;
      assignedAgentName?: string;
      escalateImmediately?: boolean;
      evidenceItems?: Array<{
        fileName: string;
        mimeType?: string;
        fileUrlOrData: string;
        description?: string;
      }>;
    }
  ): Promise<SupportComplaintRecord> {
    await this.ensureDefaultComplaintCategories(organizationId);
    const config = await this.getOperationsConfig(organizationId);
    const now = new Date().toISOString();
    const complaintId = createOpsId('clm');
    const referenceCode = generateComplaintReferenceCode();

    const orderIdClean = (input.orderId || '').trim();
    const productClean = input.productOrService.trim() || 'General Product / Service';

    // Detect duplicate complaint for the same order_id within this business
    let duplicateOfId: string | null = null;
    if (orderIdClean.length > 0) {
      const existingOrderComplaint = await this.db
        .prepare(
          `SELECT id, reference_code FROM support_complaints
           WHERE organization_id = ? AND LOWER(order_id) = LOWER(?)
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(organizationId, orderIdClean)
        .first<{ id: string; reference_code: string }>();

      if (existingOrderComplaint) {
        duplicateOfId = existingOrderComplaint.id;
      }
    }

    // Resolve category settings
    let resolvedCategoryName = input.categoryName?.trim() || 'General Complaint';
    let resolvedCategoryId = input.categoryId || null;
    let resolvedPriority = input.priority || EscalationPriority.Normal;
    let shouldAutoEscalate = Boolean(input.escalateImmediately);

    if (input.categoryId) {
      const catRow = await this.db
        .prepare(
          `SELECT id, name, default_priority, auto_escalate_to_supervisor
           FROM complaint_categories
           WHERE id = ? AND organization_id = ?`
        )
        .bind(input.categoryId, organizationId)
        .first<{
          id: string;
          name: string;
          default_priority: EscalationPriority;
          auto_escalate_to_supervisor: number;
        }>();
      if (catRow) {
        resolvedCategoryId = catRow.id;
        resolvedCategoryName = catRow.name;
        if (!input.priority) resolvedPriority = catRow.default_priority;
        if (Number(catRow.auto_escalate_to_supervisor) === 1) {
          shouldAutoEscalate = true;
        }
      }
    }

    // Encrypt login credentials at rest if supplied
    const rawLogin = (input.loginInfo || '').trim();
    const encryptedLogin = rawLogin
      ? encryptIntegrationCredentials(rawLogin, this.encryptionSecret)
      : null;
    const maskedLogin = rawLogin ? maskSensitiveCredentialString(rawLogin) : '';

    // Determine initial agent & supervisor assignment
    const assignedAgentId =
      input.assignedAgentId ||
      (actor.userRole === UserRole.Agent ? actor.userId : null);
    const assignedAgentName =
      input.assignedAgentName ||
      (actor.userRole === UserRole.Agent ? actor.userName : null);

    let initialStatus: ClaimStatus = 'submitted';
    let assignedSupervisorId: string | null = null;
    let assignedSupervisorName: string | null = null;
    let escalatedAt: string | null = null;

    if (shouldAutoEscalate) {
      initialStatus = 'pending_review';
      escalatedAt = now;
      if (config.autoAssignSupervisor) {
        const sup = await this.findAvailableSupervisor(organizationId);
        if (sup) {
          assignedSupervisorId = sup.userId || sup.id;
          assignedSupervisorName = sup.displayName;
        }
      }
    }

    await this.db
      .prepare(
        `INSERT INTO support_complaints (
          id, reference_code, organization_id, conversation_id, ticket_id, customer_id,
          customer_name, customer_email, order_id, product_or_service, category_id, category_name,
          status, priority, description, encrypted_login_info, login_info_masked, custom_fields_json,
          duplicate_of_complaint_id, is_potential_duplicate, created_by_user_id, created_by_name,
          created_by_role, assigned_agent_id, assigned_agent_name, assigned_supervisor_id,
          assigned_supervisor_name, escalated_at, reopened_count, last_activity_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .bind(
        complaintId,
        referenceCode,
        organizationId,
        input.conversationId || null,
        input.ticketId || null,
        input.customerId || null,
        input.customerName.trim(),
        (input.customerEmail || '').trim(),
        orderIdClean,
        productClean,
        resolvedCategoryId,
        resolvedCategoryName,
        initialStatus,
        resolvedPriority,
        input.description.trim(),
        encryptedLogin,
        maskedLogin,
        JSON.stringify(input.customFields || {}),
        duplicateOfId,
        duplicateOfId ? 1 : 0,
        actor.userId,
        actor.userName,
        actor.userRole,
        assignedAgentId,
        assignedAgentName,
        assignedSupervisorId,
        assignedSupervisorName,
        escalatedAt,
        now,
        now,
        now
      )
      .run();

    // Attach initial evidence items if provided
    if (input.evidenceItems && input.evidenceItems.length > 0) {
      for (const ev of input.evidenceItems) {
        await this.addComplaintEvidence(organizationId, complaintId, actor, ev);
      }
    }

    await this.recordMeaningfulAgentAction(
      organizationId,
      actor,
      'complaint_created',
      `Created complaint ${referenceCode} for order ${orderIdClean || 'N/A'} (${productClean})`
    );

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'complaint',
      eventType: 'complaint_submitted',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: referenceCode,
      complaintId,
      conversationId: input.conversationId || null,
      productOrService: productClean,
      summary: `Complaint ${referenceCode} submitted for ${input.customerName.trim()} (${productClean}${orderIdClean ? `, Order #${orderIdClean}` : ''}).`,
      metadata: {
        orderId: orderIdClean,
        categoryName: resolvedCategoryName,
        priority: resolvedPriority,
        isPotentialDuplicate: Boolean(duplicateOfId),
      },
    });

    if (shouldAutoEscalate) {
      await this.recordOperationalEvent({
        organizationId,
        eventCategory: 'complaint',
        eventType: 'complaint_escalated',
        actorUserId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.userRole,
        caseReference: referenceCode,
        complaintId,
        productOrService: productClean,
        summary: `Complaint ${referenceCode} escalated to Supervisor Verification Queue${assignedSupervisorName ? ` (${assignedSupervisorName})` : ''}.`,
      });
    }

    const detail = await this.getComplaintDetail(organizationId, complaintId);
    if (!detail) {
      throw new Error('Failed to load newly created complaint record.');
    }
    return detail;
  }

  private async findAvailableSupervisor(organizationId: string): Promise<{
    id: string;
    userId: string | null;
    displayName: string;
  } | null> {
    const row = await this.db
      .prepare(
        `SELECT id, user_id, display_name
         FROM support_agents
         WHERE organization_id = ?
           AND role IN ('supervisor', 'admin', 'owner')
           AND COALESCE(membership_status, 'active') = 'active'
         ORDER BY CASE WHEN role = 'supervisor' THEN 0 WHEN role = 'admin' THEN 1 ELSE 2 END,
                  CASE WHEN availability = 'available' THEN 0 WHEN availability = 'busy' THEN 1 ELSE 2 END,
                  updated_at ASC
         LIMIT 1`
      )
      .bind(organizationId)
      .first<{ id: string; user_id: string | null; display_name: string }>();

    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
    };
  }

  async listComplaints(
    organizationId: string,
    filters?: {
      status?: ClaimStatus | 'all';
      supervisorQueue?:
        | 'pending_review'
        | 'in_progress'
        | 'awaiting_information'
        | 'approved'
        | 'awaiting_replacement'
        | 'declined'
        | 'resolved'
        | 'all';
      assignedAgentId?: string;
      assignedSupervisorId?: string;
      orderId?: string;
      conversationId?: string;
      search?: string;
      onlyDuplicates?: boolean;
    }
  ): Promise<SupportComplaintRecord[]> {
    const clauses: string[] = ['c.organization_id = ?'];
    const params: unknown[] = [organizationId];

    if (filters?.status && filters.status !== 'all') {
      clauses.push('c.status = ?');
      params.push(filters.status);
    }
    if (filters?.supervisorQueue && filters.supervisorQueue !== 'all') {
      clauses.push('c.status = ?');
      params.push(filters.supervisorQueue);
    }
    if (filters?.assignedAgentId) {
      clauses.push('(c.assigned_agent_id = ? OR LOWER(c.assigned_agent_name) = LOWER(?))');
      params.push(filters.assignedAgentId, filters.assignedAgentId);
    }
    if (filters?.assignedSupervisorId) {
      clauses.push(
        '(c.assigned_supervisor_id = ? OR LOWER(c.assigned_supervisor_name) = LOWER(?))'
      );
      params.push(filters.assignedSupervisorId, filters.assignedSupervisorId);
    }
    if (filters?.orderId) {
      clauses.push('LOWER(c.order_id) = LOWER(?)');
      params.push(filters.orderId.trim());
    }
    if (filters?.conversationId) {
      clauses.push('c.conversation_id = ?');
      params.push(filters.conversationId);
    }
    if (filters?.onlyDuplicates) {
      clauses.push('c.is_potential_duplicate = 1');
    }
    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      clauses.push(
        `(LOWER(c.reference_code) LIKE ? OR LOWER(c.customer_name) LIKE ? OR LOWER(c.customer_email) LIKE ? OR LOWER(c.order_id) LIKE ? OR LOWER(c.product_or_service) LIKE ? OR LOWER(c.description) LIKE ?)`
      );
      params.push(q, q, q, q, q, q);
    }

    const sql = `
      SELECT
        c.*,
        dup.reference_code AS duplicate_reference_code,
        inv.identifier_masked AS allocated_replacement_masked,
        inv.status AS allocated_replacement_status
      FROM support_complaints c
      LEFT JOIN support_complaints dup
        ON dup.id = c.duplicate_of_complaint_id AND dup.organization_id = c.organization_id
      LEFT JOIN replacement_inventory_items inv
        ON inv.id = c.allocated_replacement_id AND inv.organization_id = c.organization_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY
        CASE c.priority
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          ELSE 3
        END,
        c.updated_at DESC
    `;

    const { results } = await this.db
      .prepare(sql)
      .bind(...params)
      .all<Record<string, unknown>>();

    return results.map((r) => this.mapComplaintRow(r));
  }

  async getComplaintDetail(
    organizationId: string,
    complaintIdOrRef: string
  ): Promise<SupportComplaintRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           c.*,
           dup.reference_code AS duplicate_reference_code,
           inv.identifier_masked AS allocated_replacement_masked,
           inv.status AS allocated_replacement_status
         FROM support_complaints c
         LEFT JOIN support_complaints dup
           ON dup.id = c.duplicate_of_complaint_id AND dup.organization_id = c.organization_id
         LEFT JOIN replacement_inventory_items inv
           ON inv.id = c.allocated_replacement_id AND inv.organization_id = c.organization_id
         WHERE c.organization_id = ? AND (c.id = ? OR c.reference_code = ?)`
      )
      .bind(organizationId, complaintIdOrRef, complaintIdOrRef)
      .first<Record<string, unknown>>();

    if (!row) return null;

    const mapped = this.mapComplaintRow(row);

    const [evRes, comRes, histRes, orderCountRow] = await Promise.all([
      this.db
        .prepare(
          `SELECT * FROM complaint_evidence
           WHERE organization_id = ? AND complaint_id = ?
           ORDER BY created_at ASC`
        )
        .bind(organizationId, mapped.id)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT * FROM complaint_internal_comments
           WHERE organization_id = ? AND complaint_id = ?
           ORDER BY created_at ASC`
        )
        .bind(organizationId, mapped.id)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT * FROM complaint_assignments_history
           WHERE organization_id = ? AND complaint_id = ?
           ORDER BY created_at ASC`
        )
        .bind(organizationId, mapped.id)
        .all<Record<string, unknown>>(),
      mapped.orderId
        ? this.db
            .prepare(
              `SELECT COUNT(*) AS total FROM support_complaints
               WHERE organization_id = ? AND LOWER(order_id) = LOWER(?) AND id != ?`
            )
            .bind(organizationId, mapped.orderId, mapped.id)
            .first<{ total: number }>()
        : Promise.resolve({ total: 0 }),
    ]);

    mapped.evidence = evRes.results.map((e) => ({
      id: String(e.id),
      organizationId: String(e.organization_id),
      complaintId: String(e.complaint_id),
      fileName: String(e.file_name),
      mimeType: String(e.mime_type || 'image/png'),
      fileUrlOrData: String(e.file_url_or_data),
      description: String(e.description || ''),
      uploadedByUserId: e.uploaded_by_user_id ? String(e.uploaded_by_user_id) : null,
      uploadedByName: String(e.uploaded_by_name),
      uploadedByRole: (e.uploaded_by_role as UserRole) || UserRole.Agent,
      createdAt: String(e.created_at),
    }));

    mapped.comments = comRes.results.map((cm) => ({
      id: String(cm.id),
      organizationId: String(cm.organization_id),
      complaintId: String(cm.complaint_id),
      authorUserId: cm.author_user_id ? String(cm.author_user_id) : null,
      authorName: String(cm.author_name),
      authorRole: (cm.author_role as UserRole) || UserRole.Agent,
      commentType: (cm.comment_type as ComplaintCommentType) || 'internal_note',
      body: String(cm.body),
      isVisibleToCustomer: Number(cm.is_visible_to_customer ?? 0) === 1,
      createdAt: String(cm.created_at),
    }));

    mapped.assignmentHistory = histRes.results.map((h) => ({
      id: String(h.id),
      organizationId: String(h.organization_id),
      complaintId: String(h.complaint_id),
      fromUserId: h.from_user_id ? String(h.from_user_id) : null,
      fromUserName: h.from_user_name ? String(h.from_user_name) : null,
      toUserId: h.to_user_id ? String(h.to_user_id) : null,
      toUserName: String(h.to_user_name),
      assignmentRole: (h.assignment_role as 'agent' | 'supervisor') || 'supervisor',
      reason: String(h.reason || ''),
      actorUserId: h.actor_user_id ? String(h.actor_user_id) : null,
      actorName: String(h.actor_name),
      createdAt: String(h.created_at),
    }));

    mapped.previousOrderComplaintsCount = Number(orderCountRow?.total ?? 0);

    return mapped;
  }

  private mapComplaintRow(r: Record<string, unknown>): SupportComplaintRecord {
    let customFields: Record<string, string> = {};
    try {
      customFields = JSON.parse(String(r.custom_fields_json || '{}'));
    } catch {
      customFields = {};
    }

    return {
      id: String(r.id),
      referenceCode: String(r.reference_code),
      organizationId: String(r.organization_id),
      conversationId: r.conversation_id ? String(r.conversation_id) : null,
      ticketId: r.ticket_id ? String(r.ticket_id) : null,
      customerId: r.customer_id ? String(r.customer_id) : null,
      customerName: String(r.customer_name),
      customerEmail: String(r.customer_email || ''),
      orderId: String(r.order_id || ''),
      productOrService: String(r.product_or_service || ''),
      categoryId: r.category_id ? String(r.category_id) : null,
      categoryName: String(r.category_name || 'General Complaint'),
      status: (r.status as ClaimStatus) || 'submitted',
      priority: (r.priority as EscalationPriority) || EscalationPriority.Normal,
      description: String(r.description || ''),
      hasEncryptedLoginInfo: Boolean(r.encrypted_login_info),
      loginInfoMasked: String(r.login_info_masked || ''),
      customFields,
      duplicateOfComplaintId: r.duplicate_of_complaint_id
        ? String(r.duplicate_of_complaint_id)
        : null,
      duplicateReferenceCode: r.duplicate_reference_code
        ? String(r.duplicate_reference_code)
        : null,
      isPotentialDuplicate: Number(r.is_potential_duplicate ?? 0) === 1,
      createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : null,
      createdByName: String(r.created_by_name || 'Support Specialist'),
      createdByRole: (r.created_by_role as UserRole) || UserRole.Agent,
      assignedAgentId: r.assigned_agent_id ? String(r.assigned_agent_id) : null,
      assignedAgentName: r.assigned_agent_name ? String(r.assigned_agent_name) : null,
      assignedSupervisorId: r.assigned_supervisor_id
        ? String(r.assigned_supervisor_id)
        : null,
      assignedSupervisorName: r.assigned_supervisor_name
        ? String(r.assigned_supervisor_name)
        : null,
      escalatedAt: r.escalated_at ? String(r.escalated_at) : null,
      reviewedBySupervisorId: r.reviewed_by_supervisor_id
        ? String(r.reviewed_by_supervisor_id)
        : null,
      reviewedBySupervisorName: r.reviewed_by_supervisor_name
        ? String(r.reviewed_by_supervisor_name)
        : null,
      reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
      decision: (r.decision as ClaimDecisionType) || null,
      decisionReason: r.decision_reason ? String(r.decision_reason) : null,
      resolutionType: r.resolution_type ? String(r.resolution_type) : null,
      resolutionSummary: r.resolution_summary ? String(r.resolution_summary) : null,
      allocatedReplacementId: r.allocated_replacement_id
        ? String(r.allocated_replacement_id)
        : null,
      allocatedReplacementMasked: r.allocated_replacement_masked
        ? String(r.allocated_replacement_masked)
        : null,
      allocatedReplacementStatus:
        (r.allocated_replacement_status as ReplacementInventoryStatus) || null,
      deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
      reopenedCount: Number(r.reopened_count ?? 0),
      lastActivityAt: String(r.last_activity_at || r.updated_at || r.created_at),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  /**
   * Securely decrypts customer-supplied complaint login credentials for authorized staff
   * and records an immutable access log entry without logging the secret itself.
   */
  async revealComplaintLoginCredentials(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext
  ): Promise<{ loginInfo: string }> {
    if (actor.userRole === UserRole.Viewer || actor.userRole === UserRole.Customer) {
      throw new Error('FORBIDDEN: Insufficient permissions to reveal encrypted login information.');
    }

    const row = await this.db
      .prepare(
        `SELECT id, reference_code, encrypted_login_info, product_or_service
         FROM support_complaints
         WHERE id = ? AND organization_id = ?`
      )
      .bind(complaintId, organizationId)
      .first<{
        id: string;
        reference_code: string;
        encrypted_login_info: string | null;
        product_or_service: string;
      }>();

    if (!row) {
      throw new Error('Complaint record not found in this workspace.');
    }
    if (!row.encrypted_login_info) {
      return { loginInfo: '' };
    }

    const decrypted = decryptIntegrationCredentials(
      row.encrypted_login_info,
      this.encryptionSecret
    );
    if (!decrypted) {
      throw new Error('Unable to decrypt complaint login credentials.');
    }

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'complaint',
      eventType: 'complaint_credentials_revealed',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: row.reference_code,
      complaintId: row.id,
      productOrService: row.product_or_service,
      summary: `${actor.userName} (${actor.userRole}) accessed encrypted login information on complaint ${row.reference_code}.`,
    });

    return { loginInfo: decrypted };
  }

  async addComplaintEvidence(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext,
    input: {
      fileName: string;
      mimeType?: string;
      fileUrlOrData: string;
      description?: string;
    }
  ): Promise<ComplaintEvidenceRecord> {
    const complaint = await this.db
      .prepare(`SELECT id, reference_code FROM support_complaints WHERE id = ? AND organization_id = ?`)
      .bind(complaintId, organizationId)
      .first<{ id: string; reference_code: string }>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }

    const now = new Date().toISOString();
    const id = createOpsId('cev');
    await this.db
      .prepare(
        `INSERT INTO complaint_evidence
           (id, organization_id, complaint_id, file_name, mime_type, file_url_or_data, description, uploaded_by_user_id, uploaded_by_name, uploaded_by_role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        organizationId,
        complaintId,
        input.fileName.trim(),
        input.mimeType?.trim() || 'image/png',
        input.fileUrlOrData.trim(),
        input.description?.trim() || '',
        actor.userId,
        actor.userName,
        actor.userRole,
        now
      )
      .run();

    await this.db
      .prepare(`UPDATE support_complaints SET last_activity_at = ?, updated_at = ? WHERE id = ? AND organization_id = ?`)
      .bind(now, now, complaintId, organizationId)
      .run();

    return {
      id,
      organizationId,
      complaintId,
      fileName: input.fileName.trim(),
      mimeType: input.mimeType?.trim() || 'image/png',
      fileUrlOrData: input.fileUrlOrData.trim(),
      description: input.description?.trim() || '',
      uploadedByUserId: actor.userId,
      uploadedByName: actor.userName,
      uploadedByRole: actor.userRole,
      createdAt: now,
    };
  }

  async addComplaintComment(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext,
    input: {
      commentType?: ComplaintCommentType;
      body: string;
      notifyCustomerInConversation?: boolean;
    }
  ): Promise<ComplaintInternalCommentRecord> {
    const complaint = await this.db
      .prepare(
        `SELECT id, reference_code, conversation_id, status, product_or_service
         FROM support_complaints
         WHERE id = ? AND organization_id = ?`
      )
      .bind(complaintId, organizationId)
      .first<{
        id: string;
        reference_code: string;
        conversation_id: string | null;
        status: ClaimStatus;
        product_or_service: string;
      }>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }

    const commentType: ComplaintCommentType = input.commentType || 'internal_note';
    // Internal discussions and supervisor instructions are NEVER visible to customers
    const isVisibleToCustomer =
      commentType === 'customer_update' && Boolean(input.notifyCustomerInConversation);

    const now = new Date().toISOString();
    const commentId = createOpsId('ccm');

    await this.db
      .prepare(
        `INSERT INTO complaint_internal_comments
           (id, organization_id, complaint_id, author_user_id, author_name, author_role, comment_type, body, is_visible_to_customer, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        commentId,
        organizationId,
        complaintId,
        actor.userId,
        actor.userName,
        actor.userRole,
        commentType,
        input.body.trim(),
        isVisibleToCustomer ? 1 : 0,
        now
      )
      .run();

    if (commentType === 'info_request') {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET status = 'awaiting_information', last_activity_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(now, now, complaintId, organizationId)
        .run();
    } else {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET last_activity_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(now, now, complaintId, organizationId)
        .run();
    }

    // If agent/supervisor explicitly sends a customer update and a conversation is linked, post to conversation
    if (isVisibleToCustomer && complaint.conversation_id) {
      await this.db
        .prepare(
          `INSERT INTO support_messages
             (id, conversation_id, organization_id, sender_type, sender_name, sender_user_id, body, is_internal_note, delivery_status, created_at)
           VALUES (?, ?, ?, 'agent', ?, ?, ?, 0, 'delivered', ?)`
        )
        .bind(
          createOpsId('msg'),
          complaint.conversation_id,
          organizationId,
          actor.userName,
          actor.userId,
          `[Case ${complaint.reference_code}] ${input.body.trim()}`,
          now
        )
        .run();
    }

    await this.recordMeaningfulAgentAction(
      organizationId,
      actor,
      `complaint_${commentType}`,
      `Added ${commentType.replace(/_/g, ' ')} on complaint ${complaint.reference_code}`
    );

    return {
      id: commentId,
      organizationId,
      complaintId,
      authorUserId: actor.userId,
      authorName: actor.userName,
      authorRole: actor.userRole,
      commentType,
      body: input.body.trim(),
      isVisibleToCustomer,
      createdAt: now,
    };
  }

  /**
   * Escalates a complaint from Support Agent to the Supervisor Verification Queue.
   */
  async escalateComplaintToSupervisor(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext,
    input: {
      supervisorId?: string;
      supervisorName?: string;
      priority?: EscalationPriority;
      escalationNote?: string;
    }
  ): Promise<SupportComplaintRecord> {
    const complaint = await this.db
      .prepare(
        `SELECT * FROM support_complaints WHERE id = ? AND organization_id = ?`
      )
      .bind(complaintId, organizationId)
      .first<Record<string, unknown>>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }

    const now = new Date().toISOString();
    let targetSupId = input.supervisorId?.trim() || null;
    let targetSupName = input.supervisorName?.trim() || null;

    if (targetSupId && !targetSupName) {
      const supRow = await this.db
        .prepare(
          `SELECT id, user_id, display_name FROM support_agents
           WHERE organization_id = ? AND (id = ? OR user_id = ?)`
        )
        .bind(organizationId, targetSupId, targetSupId)
        .first<{ id: string; user_id: string | null; display_name: string }>();
      if (supRow) {
        targetSupId = supRow.user_id || supRow.id;
        targetSupName = supRow.display_name;
      }
    }

    if (!targetSupId) {
      const autoSup = await this.findAvailableSupervisor(organizationId);
      if (autoSup) {
        targetSupId = autoSup.userId || autoSup.id;
        targetSupName = autoSup.displayName;
      }
    }

    const nextPriority =
      input.priority || (complaint.priority as EscalationPriority) || EscalationPriority.High;

    await this.db
      .prepare(
        `UPDATE support_complaints
         SET status = 'pending_review',
             priority = ?,
             assigned_supervisor_id = COALESCE(?, assigned_supervisor_id),
             assigned_supervisor_name = COALESCE(?, assigned_supervisor_name),
             escalated_at = COALESCE(escalated_at, ?),
             last_activity_at = ?,
             updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(
        nextPriority,
        targetSupId,
        targetSupName,
        now,
        now,
        now,
        complaintId,
        organizationId
      )
      .run();

    if (targetSupName) {
      await this.db
        .prepare(
          `INSERT INTO complaint_assignments_history
             (id, organization_id, complaint_id, from_user_id, from_user_name, to_user_id, to_user_name, assignment_role, reason, actor_user_id, actor_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'supervisor', ?, ?, ?, ?)`
        )
        .bind(
          createOpsId('cah'),
          organizationId,
          complaintId,
          complaint.assigned_supervisor_id ? String(complaint.assigned_supervisor_id) : null,
          complaint.assigned_supervisor_name ? String(complaint.assigned_supervisor_name) : null,
          targetSupId,
          targetSupName,
          input.escalationNote?.trim() || 'Escalated to supervisor verification queue',
          actor.userId,
          actor.userName,
          now
        )
        .run();
    }

    if (input.escalationNote && input.escalationNote.trim()) {
      await this.addComplaintComment(organizationId, complaintId, actor, {
        commentType: 'escalation_note',
        body: input.escalationNote.trim(),
      });
    }

    await this.recordMeaningfulAgentAction(
      organizationId,
      actor,
      'complaint_escalated',
      `Escalated complaint ${String(complaint.reference_code)} to supervisor`
    );

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'complaint',
      eventType: 'complaint_escalated',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: String(complaint.reference_code),
      complaintId,
      productOrService: String(complaint.product_or_service || ''),
      summary: `${actor.userName} escalated complaint ${String(complaint.reference_code)} to Supervisor ${targetSupName || 'Queue'} (${nextPriority} priority).`,
      metadata: {
        assignedSupervisorId: targetSupId,
        assignedSupervisorName: targetSupName,
        priority: nextPriority,
      },
    });

    const updated = await this.getComplaintDetail(organizationId, complaintId);
    if (!updated) throw new Error('Complaint not found after escalation.');
    return updated;
  }

  /**
   * Reassigns a complaint to another supervisor or support agent within the same business.
   */
  async reassignComplaint(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext,
    input: {
      assignmentRole: 'supervisor' | 'agent';
      toUserId: string;
      toUserName: string;
      reason?: string;
    }
  ): Promise<SupportComplaintRecord> {
    const complaint = await this.db
      .prepare(`SELECT * FROM support_complaints WHERE id = ? AND organization_id = ?`)
      .bind(complaintId, organizationId)
      .first<Record<string, unknown>>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }

    const now = new Date().toISOString();
    const fromId =
      input.assignmentRole === 'supervisor'
        ? complaint.assigned_supervisor_id
        : complaint.assigned_agent_id;
    const fromName =
      input.assignmentRole === 'supervisor'
        ? complaint.assigned_supervisor_name
        : complaint.assigned_agent_name;

    if (input.assignmentRole === 'supervisor') {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET assigned_supervisor_id = ?, assigned_supervisor_name = ?, last_activity_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(input.toUserId, input.toUserName.trim(), now, now, complaintId, organizationId)
        .run();
    } else {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET assigned_agent_id = ?, assigned_agent_name = ?, last_activity_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(input.toUserId, input.toUserName.trim(), now, now, complaintId, organizationId)
        .run();
    }

    await this.db
      .prepare(
        `INSERT INTO complaint_assignments_history
           (id, organization_id, complaint_id, from_user_id, from_user_name, to_user_id, to_user_name, assignment_role, reason, actor_user_id, actor_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createOpsId('cah'),
        organizationId,
        complaintId,
        fromId ? String(fromId) : null,
        fromName ? String(fromName) : null,
        input.toUserId,
        input.toUserName.trim(),
        input.assignmentRole,
        input.reason?.trim() || `Reassigned ${input.assignmentRole}`,
        actor.userId,
        actor.userName,
        now
      )
      .run();

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'supervisor',
      eventType: 'complaint_reassigned',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: String(complaint.reference_code),
      complaintId,
      productOrService: String(complaint.product_or_service || ''),
      summary: `${actor.userName} reassigned ${input.assignmentRole} on ${String(complaint.reference_code)} to ${input.toUserName.trim()}.`,
    });

    const updated = await this.getComplaintDetail(organizationId, complaintId);
    if (!updated) throw new Error('Complaint not found after reassignment.');
    return updated;
  }

  /**
   * Supervisor Investigation & Decision Management:
   * - Enforces that ordinary Support Agents CANNOT approve or decline complaints unless
   *   explicitly authorized by an administrator (`allowAgentDirectApproval` or `claims:approve`).
   * - Requires a mandatory reason for every approval, decline, or information request.
   * - Supports immediate supervisor replacement selection (Method 1) or entering AWAITING REPLACEMENT (Method 2).
   */
  async recordSupervisorDecision(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext,
    input: {
      decision: 'in_progress' | 'approved' | 'declined' | 'info_requested';
      reason: string;
      authorizeReplacement?: boolean;
      replacementInventoryItemId?: string;
      resolutionType?: string;
      supervisorInstructionToAgent?: string;
    }
  ): Promise<SupportComplaintRecord> {
    const config = await this.getOperationsConfig(organizationId);
    const isSupervisorOrAdmin =
      actor.userRole === UserRole.Supervisor ||
      actor.userRole === UserRole.Admin ||
      actor.userRole === UserRole.Owner;
    const hasExplicitApprovePerm =
      Boolean(actor.permissions?.includes('claims:approve')) ||
      config.allowAgentDirectApproval;

    if (!isSupervisorOrAdmin && !hasExplicitApprovePerm) {
      throw new Error(
        'FORBIDDEN: Support agents are not authorized to approve or decline complaints unless explicitly permitted by an administrator.'
      );
    }

    const complaint = await this.db
      .prepare(`SELECT * FROM support_complaints WHERE id = ? AND organization_id = ?`)
      .bind(complaintId, organizationId)
      .first<Record<string, unknown>>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }

    const now = new Date().toISOString();
    const reasonClean = input.reason.trim();

    if (
      (input.decision === 'approved' ||
        input.decision === 'declined' ||
        input.decision === 'info_requested') &&
      reasonClean.length < 3
    ) {
      throw new Error(
        'VALIDATION_ERROR: A clear reason is required when approving, declining, or requesting information on a complaint.'
      );
    }

    if (input.decision === 'in_progress') {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET status = 'in_progress',
               assigned_supervisor_id = COALESCE(assigned_supervisor_id, ?),
               assigned_supervisor_name = COALESCE(assigned_supervisor_name, ?),
               last_activity_at = ?,
               updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(actor.userId, actor.userName, now, now, complaintId, organizationId)
        .run();

      await this.recordOperationalEvent({
        organizationId,
        eventCategory: 'supervisor',
        eventType: 'supervisor_investigation_started',
        actorUserId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.userRole,
        caseReference: String(complaint.reference_code),
        complaintId,
        productOrService: String(complaint.product_or_service || ''),
        summary: `Supervisor ${actor.userName} began investigating complaint ${String(complaint.reference_code)}.`,
      });

      const updated = await this.getComplaintDetail(organizationId, complaintId);
      return updated!;
    }

    let nextStatus: ClaimStatus = 'approved';
    if (input.decision === 'declined') {
      nextStatus = 'declined';
    } else if (input.decision === 'info_requested') {
      nextStatus = 'awaiting_information';
    } else if (input.decision === 'approved') {
      nextStatus =
        input.authorizeReplacement !== false ? 'awaiting_replacement' : 'approved';
    }

    await this.db
      .prepare(
        `UPDATE support_complaints
         SET status = ?,
             reviewed_by_supervisor_id = ?,
             reviewed_by_supervisor_name = ?,
             reviewed_at = ?,
             assigned_supervisor_id = COALESCE(assigned_supervisor_id, ?),
             assigned_supervisor_name = COALESCE(assigned_supervisor_name, ?),
             decision = ?,
             decision_reason = ?,
             resolution_type = COALESCE(?, resolution_type),
             last_activity_at = ?,
             updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(
        nextStatus,
        actor.userId,
        actor.userName,
        now,
        actor.userId,
        actor.userName,
        input.decision,
        reasonClean,
        input.resolutionType ||
          (input.decision === 'approved' && input.authorizeReplacement !== false
            ? 'replacement_authorized'
            : input.decision),
        now,
        now,
        complaintId,
        organizationId
      )
      .run();

    // Record supervisor decision comment
    await this.addComplaintComment(organizationId, complaintId, actor, {
      commentType:
        input.decision === 'info_requested' ? 'info_request' : 'decision_reason',
      body: `[Supervisor Decision: ${input.decision.toUpperCase()}] ${reasonClean}`,
    });

    if (input.supervisorInstructionToAgent?.trim()) {
      await this.addComplaintComment(organizationId, complaintId, actor, {
        commentType: 'supervisor_instruction',
        body: input.supervisorInstructionToAgent.trim(),
      });
    }

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'supervisor',
      eventType: `complaint_${input.decision}`,
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: String(complaint.reference_code),
      complaintId,
      productOrService: String(complaint.product_or_service || ''),
      summary: `Supervisor ${actor.userName} marked complaint ${String(complaint.reference_code)} as ${input.decision.toUpperCase()}: ${reasonClean}`,
      metadata: {
        decision: input.decision,
        authorizeReplacement: input.authorizeReplacement !== false,
        nextStatus,
      },
    });

    // METHOD 1: If supervisor also selected a specific replacement inventory item right during approval, reserve it now!
    if (
      input.decision === 'approved' &&
      input.replacementInventoryItemId &&
      input.replacementInventoryItemId.trim()
    ) {
      await this.allocateReplacementForComplaint(organizationId, actor, {
        complaintId,
        inventoryItemId: input.replacementInventoryItemId.trim(),
        notes: `Allocated by Supervisor ${actor.userName} upon complaint approval.`,
      });
    }

    const updated = await this.getComplaintDetail(organizationId, complaintId);
    if (!updated) throw new Error('Complaint not found after supervisor decision.');
    return updated;
  }

  /**
   * Resolves or closes a complaint (or reopens if needed) and notifies the customer thread if requested.
   */
  async resolveOrUpdateComplaintStatus(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext,
    input: {
      action: 'resolve' | 'reopen' | 'CustomerSuppliedInfo';
      resolutionSummary?: string;
      notifyCustomerMessage?: string;
    }
  ): Promise<SupportComplaintRecord> {
    const complaint = await this.db
      .prepare(`SELECT * FROM support_complaints WHERE id = ? AND organization_id = ?`)
      .bind(complaintId, organizationId)
      .first<Record<string, unknown>>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }

    const now = new Date().toISOString();

    if (input.action === 'resolve') {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET status = 'resolved',
               resolution_summary = COALESCE(?, resolution_summary),
               resolved_at = ?,
               last_activity_at = ?,
               updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(
          input.resolutionSummary?.trim() || 'Resolved by support team.',
          now,
          now,
          now,
          complaintId,
          organizationId
        )
        .run();

      await this.recordOperationalEvent({
        organizationId,
        eventCategory: 'complaint',
        eventType: 'complaint_resolved',
        actorUserId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.userRole,
        caseReference: String(complaint.reference_code),
        complaintId,
        productOrService: String(complaint.product_or_service || ''),
        summary: `${actor.userName} resolved complaint ${String(complaint.reference_code)}.`,
      });
    } else if (input.action === 'reopen') {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET status = 'pending_review',
               reopened_count = COALESCE(reopened_count, 0) + 1,
               last_activity_at = ?,
               updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(now, now, complaintId, organizationId)
        .run();

      await this.recordOperationalEvent({
        organizationId,
        eventCategory: 'complaint',
        eventType: 'complaint_reopened',
        actorUserId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.userRole,
        caseReference: String(complaint.reference_code),
        complaintId,
        productOrService: String(complaint.product_or_service || ''),
        summary: `${actor.userName} reopened complaint ${String(complaint.reference_code)}.`,
      });
    } else if (input.action === 'CustomerSuppliedInfo') {
      await this.db
        .prepare(
          `UPDATE support_complaints
           SET status = 'pending_review',
               last_activity_at = ?,
               updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(now, now, complaintId, organizationId)
        .run();
      if (input.resolutionSummary?.trim()) {
        await this.addComplaintComment(organizationId, complaintId, actor, {
          commentType: 'internal_note',
          body: `[Customer Supplied Requested Info] ${input.resolutionSummary.trim()}`,
        });
      }
    }

    if (input.notifyCustomerMessage?.trim()) {
      await this.addComplaintComment(organizationId, complaintId, actor, {
        commentType: 'customer_update',
        body: input.notifyCustomerMessage.trim(),
        notifyCustomerInConversation: true,
      });
    }

    const updated = await this.getComplaintDetail(organizationId, complaintId);
    return updated!;
  }

  /* ==========================================================================
     3. REPLACEMENT INVENTORY MANAGEMENT & ATOMIC FULFILMENT
  ========================================================================== */

  async expireOutdatedInventoryItems(organizationId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE replacement_inventory_items
         SET status = 'EXPIRED', updated_at = ?
         WHERE organization_id = ?
           AND status = 'AVAILABLE'
           AND expires_at IS NOT NULL
           AND expires_at != ''
           AND expires_at < ?`
      )
      .bind(now, organizationId, now)
      .run();
  }

  async listInventoryCategories(
    organizationId: string
  ): Promise<ReplacementInventoryCategoryRecord[]> {
    await this.expireOutdatedInventoryItems(organizationId);

    const { results: catRows } = await this.db
      .prepare(
        `SELECT * FROM replacement_inventory_categories
         WHERE organization_id = ?
         ORDER BY name ASC`
      )
      .bind(organizationId)
      .all<Record<string, unknown>>();

    const { results: statusCounts } = await this.db
      .prepare(
        `SELECT category_id, status, COUNT(*) AS cnt
         FROM replacement_inventory_items
         WHERE organization_id = ?
         GROUP BY category_id, status`
      )
      .bind(organizationId)
      .all<{ category_id: string; status: ReplacementInventoryStatus; cnt: number }>();

    const countMap = new Map<string, Record<ReplacementInventoryStatus, number>>();
    for (const row of statusCounts) {
      const existing = countMap.get(row.category_id) || {
        AVAILABLE: 0,
        RESERVED: 0,
        ISSUED: 0,
        EXPIRED: 0,
        INVALID: 0,
        WITHDRAWN: 0,
      };
      existing[row.status] = Number(row.cnt ?? 0);
      countMap.set(row.category_id, existing);
    }

    return catRows.map((c) => {
      const catId = String(c.id);
      const counts = countMap.get(catId) || {
        AVAILABLE: 0,
        RESERVED: 0,
        ISSUED: 0,
        EXPIRED: 0,
        INVALID: 0,
        WITHDRAWN: 0,
      };
      const threshold = Number(c.min_stock_threshold ?? 5);
      return {
        id: catId,
        organizationId: String(c.organization_id),
        slug: String(c.slug),
        name: String(c.name),
        productOrService: String(c.product_or_service),
        description: String(c.description || ''),
        minStockThreshold: threshold,
        availableCount: counts.AVAILABLE,
        reservedCount: counts.RESERVED,
        issuedCount: counts.ISSUED,
        expiredCount: counts.EXPIRED,
        invalidCount: counts.INVALID,
        withdrawnCount: counts.WITHDRAWN,
        isLowStock: counts.AVAILABLE <= threshold,
        isActive: Number(c.is_active ?? 1) === 1,
        createdAt: String(c.created_at),
        updatedAt: String(c.updated_at),
      };
    });
  }

  async upsertInventoryCategory(
    organizationId: string,
    actor: OperationsActorContext,
    input: {
      id?: string;
      name: string;
      productOrService: string;
      description?: string;
      minStockThreshold?: number;
    }
  ): Promise<ReplacementInventoryCategoryRecord> {
    if (
      actor.userRole !== UserRole.Owner &&
      actor.userRole !== UserRole.Admin &&
      actor.userRole !== UserRole.Supervisor
    ) {
      throw new Error('FORBIDDEN: Insufficient permissions to manage replacement inventory categories.');
    }

    const now = new Date().toISOString();
    const slug =
      input.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `inv-${Date.now()}`;
    const id = input.id || createOpsId('icat');

    await this.db
      .prepare(
        `INSERT INTO replacement_inventory_categories
           (id, organization_id, slug, name, product_or_service, description, min_stock_threshold, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (organization_id, slug) DO UPDATE SET
           name = excluded.name,
           product_or_service = excluded.product_or_service,
           description = excluded.description,
           min_stock_threshold = excluded.min_stock_threshold,
           updated_at = excluded.updated_at`
      )
      .bind(
        id,
        organizationId,
        slug,
        input.name.trim(),
        input.productOrService.trim(),
        input.description?.trim() || '',
        input.minStockThreshold ?? 5,
        now,
        now
      )
      .run();

    const list = await this.listInventoryCategories(organizationId);
    return list.find((c) => c.slug === slug) ?? list[0]!;
  }

  /**
   * Adds individual or bulk replacement stock records with AES-256-GCM credential encryption at rest.
   */
  async addReplacementStock(
    organizationId: string,
    actor: OperationsActorContext,
    input: {
      categoryId: string;
      batchCode?: string;
      supplierRef?: string;
      expiresAt?: string;
      notes?: string;
      credentialsList: string[];
    }
  ): Promise<{
    batch: ReplacementStockBatchRecord;
    addedItems: ReplacementInventoryItemRecord[];
  }> {
    if (
      actor.userRole !== UserRole.Owner &&
      actor.userRole !== UserRole.Admin &&
      actor.userRole !== UserRole.Supervisor
    ) {
      throw new Error('FORBIDDEN: Only administrators or authorized supervisors can add replacement stock.');
    }

    const catRow = await this.db
      .prepare(
        `SELECT * FROM replacement_inventory_categories WHERE id = ? AND organization_id = ?`
      )
      .bind(input.categoryId, organizationId)
      .first<Record<string, unknown>>();

    if (!catRow) {
      throw new Error('Inventory category not found in this business workspace.');
    }

    const cleanedCreds = input.credentialsList
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cleanedCreds.length === 0) {
      throw new Error('Please provide at least one replacement credential record.');
    }

    const now = new Date().toISOString();
    const batchId = createOpsId('bat');
    const batchCode =
      input.batchCode?.trim() ||
      `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex').toUpperCase()}`;
    const productOrService = String(catRow.product_or_service);
    const categoryName = String(catRow.name);
    const supplierRef = input.supplierRef?.trim() || '';

    await this.db
      .prepare(
        `INSERT INTO replacement_stock_batches
           (id, organization_id, category_id, batch_code, product_or_service, supplier_ref, total_added, notes, created_by_user_id, created_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        batchId,
        organizationId,
        input.categoryId,
        batchCode,
        productOrService,
        supplierRef,
        cleanedCreds.length,
        input.notes?.trim() || '',
        actor.userId,
        actor.userName,
        now
      )
      .run();

    const addedItems: ReplacementInventoryItemRecord[] = [];
    const movementType: InventoryMovementType =
      cleanedCreds.length > 1 ? 'bulk_imported' : 'added';

    for (const rawCred of cleanedCreds) {
      const itemId = createOpsId('rpl');
      const masked = maskSensitiveCredentialString(rawCred);
      const encrypted = encryptIntegrationCredentials(rawCred, this.encryptionSecret);

      await this.db
        .prepare(
          `INSERT INTO replacement_inventory_items
             (id, organization_id, category_id, batch_id, product_or_service, category_name, identifier_masked, encrypted_credentials, supplier_ref, status, expires_at, added_by_user_id, added_by_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?)`
        )
        .bind(
          itemId,
          organizationId,
          input.categoryId,
          batchId,
          productOrService,
          categoryName,
          masked,
          encrypted,
          supplierRef,
          input.expiresAt?.trim() || null,
          actor.userId,
          actor.userName,
          now,
          now
        )
        .run();

      await this.db
        .prepare(
          `INSERT INTO replacement_inventory_movements
             (id, organization_id, inventory_item_id, batch_id, movement_type, previous_status, new_status, actor_user_id, actor_name, actor_role, notes, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, 'AVAILABLE', ?, ?, ?, ?, ?)`
        )
        .bind(
          createOpsId('mov'),
          organizationId,
          itemId,
          batchId,
          movementType,
          actor.userId,
          actor.userName,
          actor.userRole,
          input.notes?.trim() || `Added in batch ${batchCode}`,
          now
        )
        .run();

      addedItems.push({
        id: itemId,
        organizationId,
        categoryId: input.categoryId,
        categoryName,
        batchId,
        batchCode,
        productOrService,
        identifierMasked: masked,
        supplierRef,
        status: 'AVAILABLE',
        expiresAt: input.expiresAt?.trim() || null,
        addedByUserId: actor.userId,
        addedByName: actor.userName,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'inventory',
      eventType: 'inventory_stock_added',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      productOrService,
      summary: `${actor.userName} added ${cleanedCreds.length} replacement stock record(s) to ${categoryName} (${batchCode}).`,
      metadata: {
        batchId,
        batchCode,
        categoryId: input.categoryId,
        count: cleanedCreds.length,
      },
    });

    return {
      batch: {
        id: batchId,
        organizationId,
        categoryId: input.categoryId,
        categoryName,
        batchCode,
        productOrService,
        supplierRef,
        totalAdded: cleanedCreds.length,
        notes: input.notes?.trim() || '',
        createdByUserId: actor.userId,
        createdByName: actor.userName,
        createdAt: now,
      },
      addedItems,
    };
  }

  /**
   * Lists replacement inventory items with masked identifiers only (NEVER exposes raw credentials).
   */
  async listInventoryItems(
    organizationId: string,
    filters?: {
      categoryId?: string;
      status?: ReplacementInventoryStatus | 'all';
      productOrService?: string;
    }
  ): Promise<ReplacementInventoryItemRecord[]> {
    await this.expireOutdatedInventoryItems(organizationId);

    const clauses: string[] = ['i.organization_id = ?'];
    const params: unknown[] = [organizationId];

    if (filters?.categoryId && filters.categoryId !== 'all') {
      clauses.push('i.category_id = ?');
      params.push(filters.categoryId);
    }
    if (filters?.status && filters.status !== 'all') {
      clauses.push('i.status = ?');
      params.push(filters.status);
    }
    if (filters?.productOrService) {
      clauses.push('LOWER(i.product_or_service) = LOWER(?)');
      params.push(filters.productOrService.trim());
    }

    const { results } = await this.db
      .prepare(
        `SELECT
           i.id, i.organization_id, i.category_id, i.category_name, i.batch_id,
           b.batch_code, i.product_or_service, i.identifier_masked, i.supplier_ref,
           i.status, i.expires_at, i.associated_complaint_id, c.reference_code AS associated_complaint_ref,
           i.associated_order_id, i.reserved_by_user_id, i.reserved_by_name, i.reserved_at,
           i.issued_by_user_id, i.issued_by_name, i.issued_at, i.added_by_user_id, i.added_by_name,
           i.created_at, i.updated_at
         FROM replacement_inventory_items i
         LEFT JOIN replacement_stock_batches b ON b.id = i.batch_id
         LEFT JOIN support_complaints c ON c.id = i.associated_complaint_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY i.created_at DESC`
      )
      .bind(...params)
      .all<Record<string, unknown>>();

    return results.map((r) => ({
      id: String(r.id),
      organizationId: String(r.organization_id),
      categoryId: String(r.category_id),
      categoryName: String(r.category_name),
      batchId: r.batch_id ? String(r.batch_id) : null,
      batchCode: r.batch_code ? String(r.batch_code) : null,
      productOrService: String(r.product_or_service),
      identifierMasked: String(r.identifier_masked),
      supplierRef: String(r.supplier_ref || ''),
      status: (r.status as ReplacementInventoryStatus) || 'AVAILABLE',
      expiresAt: r.expires_at ? String(r.expires_at) : null,
      associatedComplaintId: r.associated_complaint_id
        ? String(r.associated_complaint_id)
        : null,
      associatedComplaintRef: r.associated_complaint_ref
        ? String(r.associated_complaint_ref)
        : null,
      associatedOrderId: r.associated_order_id ? String(r.associated_order_id) : null,
      reservedByUserId: r.reserved_by_user_id ? String(r.reserved_by_user_id) : null,
      reservedByName: r.reserved_by_name ? String(r.reserved_by_name) : null,
      reservedAt: r.reserved_at ? String(r.reserved_at) : null,
      issuedByUserId: r.issued_by_user_id ? String(r.issued_by_user_id) : null,
      issuedByName: r.issued_by_name ? String(r.issued_by_name) : null,
      issuedAt: r.issued_at ? String(r.issued_at) : null,
      addedByUserId: r.added_by_user_id ? String(r.added_by_user_id) : null,
      addedByName: String(r.added_by_name || 'Administrator'),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  /**
   * Atomically reserves an AVAILABLE replacement item for an approved complaint.
   * Supports:
   * - METHOD 1: Supervisor-Controlled (Supervisor selects & reserves replacement)
   * - METHOD 2: Agent-Assisted (Authorized Agent selects & reserves replacement after supervisor approval)
   * Prevents concurrent allocation of the same replacement item via atomic SQL state check.
   */
  async allocateReplacementForComplaint(
    organizationId: string,
    actor: OperationsActorContext,
    input: {
      complaintId: string;
      inventoryItemId: string;
      notes?: string;
    }
  ): Promise<{
    complaint: SupportComplaintRecord;
    inventoryItem: ReplacementInventoryItemRecord;
  }> {
    await this.expireOutdatedInventoryItems(organizationId);
    const config = await this.getOperationsConfig(organizationId);

    const isSupervisorOrAdmin =
      actor.userRole === UserRole.Supervisor ||
      actor.userRole === UserRole.Admin ||
      actor.userRole === UserRole.Owner;

    if (!isSupervisorOrAdmin) {
      if (config.fulfilmentMethod === 'supervisor_controlled') {
        throw new Error(
          'FORBIDDEN: This business is configured for Supervisor-Controlled replacement allocation only.'
        );
      }
      if (actor.userRole !== UserRole.Agent) {
        throw new Error('FORBIDDEN: Insufficient permissions to allocate replacement stock.');
      }
    }

    const complaint = await this.db
      .prepare(`SELECT * FROM support_complaints WHERE id = ? AND organization_id = ?`)
      .bind(input.complaintId, organizationId)
      .first<Record<string, unknown>>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }

    const currentStatus = String(complaint.status) as ClaimStatus;
    if (
      currentStatus !== 'approved' &&
      currentStatus !== 'awaiting_replacement' &&
      !isSupervisorOrAdmin
    ) {
      throw new Error(
        'FORBIDDEN: Support agents can only allocate replacements after a supervisor has approved the complaint.'
      );
    }

    if (complaint.allocated_replacement_id) {
      throw new Error(
        `Complaint ${String(complaint.reference_code)} already has an allocated replacement (${String(complaint.allocated_replacement_id)}). Release the existing reservation first if changing stock.`
      );
    }

    const now = new Date().toISOString();

    // ATOMIC RESERVATION GUARD: Only succeeds if status = 'AVAILABLE' and not expired!
    const updateRes = await this.db
      .prepare(
        `UPDATE replacement_inventory_items
         SET status = 'RESERVED',
             associated_complaint_id = ?,
             associated_order_id = ?,
             reserved_by_user_id = ?,
             reserved_by_name = ?,
             reserved_at = ?,
             updated_at = ?
         WHERE id = ?
           AND organization_id = ?
           AND status = 'AVAILABLE'
           AND (expires_at IS NULL OR expires_at = '' OR expires_at > ?)`
      )
      .bind(
        input.complaintId,
        String(complaint.order_id || ''),
        actor.userId,
        actor.userName,
        now,
        now,
        input.inventoryItemId,
        organizationId,
        now
      )
      .run();

    if ((updateRes.meta?.changes ?? 0) === 0) {
      throw new Error(
        'CONFLICT: Replacement item is no longer available (it has already been reserved, issued, or expired).'
      );
    }

    await this.db
      .prepare(
        `UPDATE support_complaints
         SET allocated_replacement_id = ?,
             status = CASE WHEN status IN ('submitted', 'pending_review', 'in_progress') THEN 'approved' ELSE status END,
             last_activity_at = ?,
             updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(input.inventoryItemId, now, now, input.complaintId, organizationId)
      .run();

    await this.db
      .prepare(
        `INSERT INTO replacement_inventory_movements
           (id, organization_id, inventory_item_id, movement_type, previous_status, new_status, complaint_id, order_id, actor_user_id, actor_name, actor_role, notes, created_at)
         VALUES (?, ?, ?, 'reserved', 'AVAILABLE', 'RESERVED', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createOpsId('mov'),
        organizationId,
        input.inventoryItemId,
        input.complaintId,
        String(complaint.order_id || ''),
        actor.userId,
        actor.userName,
        actor.userRole,
        input.notes?.trim() ||
          `Reserved for complaint ${String(complaint.reference_code)}`,
        now
      )
      .run();

    await this.recordMeaningfulAgentAction(
      organizationId,
      actor,
      'replacement_reserved',
      `Reserved replacement ${input.inventoryItemId} for complaint ${String(complaint.reference_code)}`
    );

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'replacement',
      eventType: 'replacement_reserved',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: String(complaint.reference_code),
      complaintId: input.complaintId,
      inventoryItemId: input.inventoryItemId,
      productOrService: String(complaint.product_or_service || ''),
      summary: `${actor.userName} (${actor.userRole}) reserved replacement stock for complaint ${String(complaint.reference_code)}.`,
    });

    const [updatedComplaint, items] = await Promise.all([
      this.getComplaintDetail(organizationId, input.complaintId),
      this.listInventoryItems(organizationId),
    ]);
    const item = items.find((i) => i.id === input.inventoryItemId)!;

    return {
      complaint: updatedComplaint!,
      inventoryItem: item,
    };
  }

  /**
   * Cancels a replacement reservation and returns the item to AVAILABLE only if it remains valid and unexpired.
   */
  async releaseReplacementReservation(
    organizationId: string,
    actor: OperationsActorContext,
    input: {
      complaintId: string;
      reason?: string;
    }
  ): Promise<SupportComplaintRecord> {
    const complaint = await this.db
      .prepare(`SELECT * FROM support_complaints WHERE id = ? AND organization_id = ?`)
      .bind(input.complaintId, organizationId)
      .first<Record<string, unknown>>();

    if (!complaint || !complaint.allocated_replacement_id) {
      throw new Error('No reserved replacement is currently attached to this complaint.');
    }

    const itemId = String(complaint.allocated_replacement_id);
    const itemRow = await this.db
      .prepare(
        `SELECT * FROM replacement_inventory_items WHERE id = ? AND organization_id = ?`
      )
      .bind(itemId, organizationId)
      .first<Record<string, unknown>>();

    if (!itemRow) {
      throw new Error('Allocated replacement item not found.');
    }
    if (String(itemRow.status) === 'ISSUED') {
      throw new Error('Cannot release a replacement that has already been issued to a customer.');
    }

    const now = new Date().toISOString();
    const expiresAt = itemRow.expires_at ? String(itemRow.expires_at) : null;
    const isExpired = Boolean(expiresAt && expiresAt < now);
    const restoredStatus: ReplacementInventoryStatus = isExpired ? 'EXPIRED' : 'AVAILABLE';

    await this.db
      .prepare(
        `UPDATE replacement_inventory_items
         SET status = ?,
             associated_complaint_id = NULL,
             associated_order_id = NULL,
             reserved_by_user_id = NULL,
             reserved_by_name = NULL,
             reserved_at = NULL,
             updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(restoredStatus, now, itemId, organizationId)
      .run();

    await this.db
      .prepare(
        `UPDATE support_complaints
         SET allocated_replacement_id = NULL,
             status = 'awaiting_replacement',
             last_activity_at = ?,
             updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(now, now, input.complaintId, organizationId)
      .run();

    await this.db
      .prepare(
        `INSERT INTO replacement_inventory_movements
           (id, organization_id, inventory_item_id, movement_type, previous_status, new_status, complaint_id, actor_user_id, actor_name, actor_role, notes, created_at)
         VALUES (?, ?, ?, 'reservation_released', 'RESERVED', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createOpsId('mov'),
        organizationId,
        itemId,
        restoredStatus,
        input.complaintId,
        actor.userId,
        actor.userName,
        actor.userRole,
        input.reason?.trim() || 'Reservation cancelled',
        now
      )
      .run();

    const updated = await this.getComplaintDetail(organizationId, input.complaintId);
    return updated!;
  }

  /**
   * Securely retrieves the decrypted delivery credentials for an allocated replacement item
   * so the authorized agent or supervisor can deliver it to the customer.
   */
  async revealAllocatedReplacementCredentials(
    organizationId: string,
    complaintId: string,
    actor: OperationsActorContext
  ): Promise<{
    inventoryItemId: string;
    identifierMasked: string;
    credentialsPlaintext: string;
  }> {
    if (actor.userRole === UserRole.Viewer || actor.userRole === UserRole.Customer) {
      throw new Error('FORBIDDEN: Insufficient permissions to retrieve replacement credentials.');
    }

    const complaint = await this.db
      .prepare(
        `SELECT id, reference_code, allocated_replacement_id, product_or_service
         FROM support_complaints
         WHERE id = ? AND organization_id = ?`
      )
      .bind(complaintId, organizationId)
      .first<{
        id: string;
        reference_code: string;
        allocated_replacement_id: string | null;
        product_or_service: string;
      }>();

    if (!complaint || !complaint.allocated_replacement_id) {
      throw new Error('No replacement item is allocated to this complaint.');
    }

    const itemRow = await this.db
      .prepare(
        `SELECT id, identifier_masked, encrypted_credentials
         FROM replacement_inventory_items
         WHERE id = ? AND organization_id = ?`
      )
      .bind(complaint.allocated_replacement_id, organizationId)
      .first<{
        id: string;
        identifier_masked: string;
        encrypted_credentials: string;
      }>();

    if (!itemRow) {
      throw new Error('Allocated replacement item record not found.');
    }

    const decrypted = decryptIntegrationCredentials(
      itemRow.encrypted_credentials,
      this.encryptionSecret
    );
    if (!decrypted) {
      throw new Error('Unable to decrypt replacement delivery credentials.');
    }

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'replacement',
      eventType: 'replacement_credentials_retrieved',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: complaint.reference_code,
      complaintId: complaint.id,
      inventoryItemId: itemRow.id,
      productOrService: complaint.product_or_service,
      summary: `${actor.userName} (${actor.userRole}) securely retrieved allocated replacement credentials for complaint ${complaint.reference_code}.`,
    });

    return {
      inventoryItemId: itemRow.id,
      identifierMasked: itemRow.identifier_masked,
      credentialsPlaintext: decrypted,
    };
  }

  /**
   * Confirms delivery of the allocated replacement to the customer:
   * - Transitions replacement inventory status from RESERVED -> ISSUED
   * - Marks the complaint as RESOLVED
   * - Records full accountability in inventory movements and operational timeline
   */
  async confirmReplacementDelivery(
    organizationId: string,
    actor: OperationsActorContext,
    input: {
      complaintId: string;
      deliveryNotes?: string;
      sendToCustomerConversation?: boolean;
      customerMessageBody?: string;
    }
  ): Promise<SupportComplaintRecord> {
    const complaint = await this.db
      .prepare(`SELECT * FROM support_complaints WHERE id = ? AND organization_id = ?`)
      .bind(input.complaintId, organizationId)
      .first<Record<string, unknown>>();

    if (!complaint) {
      throw new Error('Complaint record not found in this workspace.');
    }
    if (!complaint.allocated_replacement_id) {
      throw new Error('Cannot confirm replacement delivery: no replacement item is reserved for this complaint.');
    }

    const itemId = String(complaint.allocated_replacement_id);
    const now = new Date().toISOString();

    const updateInv = await this.db
      .prepare(
        `UPDATE replacement_inventory_items
         SET status = 'ISSUED',
             issued_by_user_id = ?,
             issued_by_name = ?,
             issued_at = ?,
             updated_at = ?
         WHERE id = ? AND organization_id = ? AND status IN ('RESERVED', 'AVAILABLE')`
      )
      .bind(actor.userId, actor.userName, now, now, itemId, organizationId)
      .run();

    if ((updateInv.meta?.changes ?? 0) === 0) {
      throw new Error('Replacement item has already been issued or is not in a reservable state.');
    }

    const summaryText =
      input.deliveryNotes?.trim() ||
      `Replacement delivered and confirmed by ${actor.userName}.`;

    await this.db
      .prepare(
        `UPDATE support_complaints
         SET status = 'resolved',
             resolution_type = 'replacement_issued',
             resolution_summary = ?,
             delivered_at = ?,
             resolved_at = ?,
             last_activity_at = ?,
             updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(summaryText, now, now, now, now, input.complaintId, organizationId)
      .run();

    await this.db
      .prepare(
        `INSERT INTO replacement_inventory_movements
           (id, organization_id, inventory_item_id, movement_type, previous_status, new_status, complaint_id, order_id, actor_user_id, actor_name, actor_role, notes, created_at)
         VALUES (?, ?, ?, 'issued', 'RESERVED', 'ISSUED', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createOpsId('mov'),
        organizationId,
        itemId,
        input.complaintId,
        String(complaint.order_id || ''),
        actor.userId,
        actor.userName,
        actor.userRole,
        summaryText,
        now
      )
      .run();

    if (input.sendToCustomerConversation && complaint.conversation_id) {
      const msgBody =
        input.customerMessageBody?.trim() ||
        `Your replacement for Order #${String(complaint.order_id || 'N/A')} (Case ${String(complaint.reference_code)}) has been issued and delivered.`;
      await this.db
        .prepare(
          `INSERT INTO support_messages
             (id, conversation_id, organization_id, sender_type, sender_name, sender_user_id, body, is_internal_note, delivery_status, created_at)
           VALUES (?, ?, ?, 'agent', ?, ?, ?, 0, 'delivered', ?)`
        )
        .bind(
          createOpsId('msg'),
          String(complaint.conversation_id),
          organizationId,
          actor.userName,
          actor.userId,
          msgBody,
          now
        )
        .run();
    }

    await this.recordMeaningfulAgentAction(
      organizationId,
      actor,
      'replacement_delivered',
      `Delivered replacement and resolved complaint ${String(complaint.reference_code)}`
    );

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'replacement',
      eventType: 'replacement_issued',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      caseReference: String(complaint.reference_code),
      complaintId: input.complaintId,
      inventoryItemId: itemId,
      productOrService: String(complaint.product_or_service || ''),
      summary: `${actor.userName} delivered replacement and resolved complaint ${String(complaint.reference_code)}.`,
    });

    const updated = await this.getComplaintDetail(organizationId, input.complaintId);
    return updated!;
  }

  async updateInventoryItemStatus(
    organizationId: string,
    itemId: string,
    actor: OperationsActorContext,
    input: {
      status: 'INVALID' | 'WITHDRAWN' | 'EXPIRED' | 'AVAILABLE';
      notes?: string;
    }
  ): Promise<void> {
    if (
      actor.userRole !== UserRole.Owner &&
      actor.userRole !== UserRole.Admin &&
      actor.userRole !== UserRole.Supervisor
    ) {
      throw new Error('FORBIDDEN: Insufficient permissions to modify replacement stock status.');
    }

    const row = await this.db
      .prepare(`SELECT * FROM replacement_inventory_items WHERE id = ? AND organization_id = ?`)
      .bind(itemId, organizationId)
      .first<Record<string, unknown>>();

    if (!row) {
      throw new Error('Inventory item not found in this business workspace.');
    }
    const prevStatus = String(row.status) as ReplacementInventoryStatus;
    if (prevStatus === 'ISSUED') {
      throw new Error('Cannot alter the status of an already-issued replacement item.');
    }

    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE replacement_inventory_items
         SET status = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(input.status, now, itemId, organizationId)
      .run();

    const movType: InventoryMovementType =
      input.status === 'EXPIRED'
        ? 'marked_expired'
        : input.status === 'INVALID'
          ? 'marked_invalid'
          : input.status === 'WITHDRAWN'
            ? 'withdrawn'
            : 'updated';

    await this.db
      .prepare(
        `INSERT INTO replacement_inventory_movements
           (id, organization_id, inventory_item_id, batch_id, movement_type, previous_status, new_status, actor_user_id, actor_name, actor_role, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createOpsId('mov'),
        organizationId,
        itemId,
        row.batch_id ? String(row.batch_id) : null,
        movType,
        prevStatus,
        input.status,
        actor.userId,
        actor.userName,
        actor.userRole,
        input.notes?.trim() || `Changed status from ${prevStatus} to ${input.status}`,
        now
      )
      .run();

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'inventory',
      eventType: `inventory_${movType}`,
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      inventoryItemId: itemId,
      productOrService: String(row.product_or_service || ''),
      summary: `${actor.userName} updated replacement stock ${String(row.identifier_masked)} from ${prevStatus} to ${input.status}.`,
    });
  }

  async listInventoryMovements(
    organizationId: string,
    limit = 100
  ): Promise<ReplacementInventoryMovementRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT
           m.*,
           i.identifier_masked,
           i.product_or_service,
           c.reference_code AS complaint_ref
         FROM replacement_inventory_movements m
         LEFT JOIN replacement_inventory_items i ON i.id = m.inventory_item_id
         LEFT JOIN support_complaints c ON c.id = m.complaint_id
         WHERE m.organization_id = ?
         ORDER BY m.created_at DESC
         LIMIT ?`
      )
      .bind(organizationId, limit)
      .all<Record<string, unknown>>();

    return results.map((r) => ({
      id: String(r.id),
      organizationId: String(r.organization_id),
      inventoryItemId: String(r.inventory_item_id),
      identifierMasked: r.identifier_masked ? String(r.identifier_masked) : undefined,
      productOrService: r.product_or_service ? String(r.product_or_service) : undefined,
      batchId: r.batch_id ? String(r.batch_id) : null,
      movementType: (r.movement_type as InventoryMovementType) || 'updated',
      previousStatus: (r.previous_status as ReplacementInventoryStatus) || null,
      newStatus: (r.new_status as ReplacementInventoryStatus) || 'AVAILABLE',
      complaintId: r.complaint_id ? String(r.complaint_id) : null,
      complaintRef: r.complaint_ref ? String(r.complaint_ref) : null,
      orderId: r.order_id ? String(r.order_id) : null,
      actorUserId: r.actor_user_id ? String(r.actor_user_id) : null,
      actorName: String(r.actor_name),
      actorRole: (r.actor_role as UserRole) || UserRole.Admin,
      notes: String(r.notes || ''),
      createdAt: String(r.created_at),
    }));
  }

  async getSupervisorQueueCounts(organizationId: string): Promise<
    Record<
      | 'pending_review'
      | 'in_progress'
      | 'awaiting_information'
      | 'approved'
      | 'awaiting_replacement'
      | 'declined'
      | 'resolved',
      number
    >
  > {
    const { results } = await this.db
      .prepare(
        `SELECT status, COUNT(*) AS cnt
         FROM support_complaints
         WHERE organization_id = ?
         GROUP BY status`
      )
      .bind(organizationId)
      .all<{ status: string; cnt: number }>();

    const counts = {
      pending_review: 0,
      in_progress: 0,
      awaiting_information: 0,
      approved: 0,
      awaiting_replacement: 0,
      declined: 0,
      resolved: 0,
    };
    for (const r of results) {
      if (r.status in counts) {
        counts[r.status as keyof typeof counts] = Number(r.cnt ?? 0);
      }
    }
    return counts;
  }

  async listStockBatches(
    organizationId: string,
    categoryId?: string
  ): Promise<ReplacementStockBatchRecord[]> {
    const sql =
      categoryId && categoryId !== 'all'
        ? `SELECT b.*, c.name AS category_name
           FROM replacement_stock_batches b
           LEFT JOIN replacement_inventory_categories c ON c.id = b.category_id
           WHERE b.organization_id = ? AND b.category_id = ?
           ORDER BY b.created_at DESC`
        : `SELECT b.*, c.name AS category_name
           FROM replacement_stock_batches b
           LEFT JOIN replacement_inventory_categories c ON c.id = b.category_id
           WHERE b.organization_id = ?
           ORDER BY b.created_at DESC`;

    const stmt =
      categoryId && categoryId !== 'all'
        ? this.db.prepare(sql).bind(organizationId, categoryId)
        : this.db.prepare(sql).bind(organizationId);

    const { results } = await stmt.all<Record<string, unknown>>();
    return results.map((r) => ({
      id: String(r.id),
      organizationId: String(r.organization_id),
      categoryId: String(r.category_id),
      categoryName: r.category_name ? String(r.category_name) : undefined,
      batchCode: String(r.batch_code),
      productOrService: String(r.product_or_service),
      supplierRef: String(r.supplier_ref || ''),
      totalAdded: Number(r.total_added ?? 0),
      notes: String(r.notes || ''),
      createdByUserId: r.created_by_user_id ? String(r.created_by_user_id) : null,
      createdByName: String(r.created_by_name || 'Administrator'),
      createdAt: String(r.created_at),
    }));
  }

  async revealInventoryItemCredentials(
    organizationId: string,
    itemId: string,
    actor: OperationsActorContext
  ): Promise<{
    inventoryItemId: string;
    identifierMasked: string;
    credentialsPlaintext: string;
  }> {
    if (actor.userRole === UserRole.Viewer || actor.userRole === UserRole.Customer) {
      throw new Error('FORBIDDEN: Insufficient permissions to reveal replacement credentials.');
    }

    const itemRow = await this.db
      .prepare(
        `SELECT id, identifier_masked, encrypted_credentials, product_or_service, associated_complaint_id
         FROM replacement_inventory_items
         WHERE id = ? AND organization_id = ?`
      )
      .bind(itemId, organizationId)
      .first<{
        id: string;
        identifier_masked: string;
        encrypted_credentials: string;
        product_or_service: string;
        associated_complaint_id: string | null;
      }>();

    if (!itemRow) {
      throw new Error('Replacement inventory item not found.');
    }

    const decrypted = decryptIntegrationCredentials(
      itemRow.encrypted_credentials,
      this.encryptionSecret
    );
    if (!decrypted) {
      throw new Error('Unable to decrypt replacement credentials.');
    }

    await this.recordOperationalEvent({
      organizationId,
      eventCategory: 'inventory',
      eventType: 'inventory_credentials_revealed',
      actorUserId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      complaintId: itemRow.associated_complaint_id,
      inventoryItemId: itemRow.id,
      productOrService: itemRow.product_or_service,
      summary: `${actor.userName} (${actor.userRole}) accessed encrypted replacement stock credentials (${itemRow.identifier_masked}).`,
    });

    return {
      inventoryItemId: itemRow.id,
      identifierMasked: itemRow.identifier_masked,
      credentialsPlaintext: decrypted,
    };
  }

  /* ==========================================================================
     4. CENTRALIZED OPERATIONAL ACTIVITY TIMELINE & MEANINGFUL AGENT TRACKING
  ========================================================================== */

  async recordOperationalEvent(input: {
    organizationId: string;
    eventCategory: OperationalActivityCategory;
    eventType: string;
    actorUserId?: string | null;
    actorName: string;
    actorRole: UserRole;
    caseReference?: string | null;
    complaintId?: string | null;
    conversationId?: string | null;
    inventoryItemId?: string | null;
    productOrService?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO operational_activity_events
           (id, organization_id, event_category, event_type, actor_user_id, actor_name, actor_role, case_reference, complaint_id, conversation_id, inventory_item_id, product_or_service, summary, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createOpsId('oev'),
        input.organizationId,
        input.eventCategory,
        input.eventType,
        input.actorUserId || null,
        input.actorName,
        input.actorRole,
        input.caseReference || null,
        input.complaintId || null,
        input.conversationId || null,
        input.inventoryItemId || null,
        input.productOrService || null,
        input.summary,
        JSON.stringify(input.metadata || {}),
        now
      )
      .run();
  }

  /**
   * Tracks meaningful agent/supervisor actions (replies, assignments, escalations, complaint creation,
   * replacement delivery) rather than relying on an online indicator.
   */
  async recordMeaningfulAgentAction(
    organizationId: string,
    actor: OperationsActorContext,
    actionType: string,
    summary: string
  ): Promise<void> {
    if (!actor.userId) return;
    const now = new Date().toISOString();
    const recentCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const activeSession = await this.db
      .prepare(
        `SELECT id, actions_count FROM agent_activity_sessions
         WHERE organization_id = ? AND user_id = ? AND last_meaningful_action_at >= ?
         ORDER BY last_meaningful_action_at DESC LIMIT 1`
      )
      .bind(organizationId, actor.userId, recentCutoff)
      .first<{ id: string; actions_count: number }>();

    if (activeSession) {
      await this.db
        .prepare(
          `UPDATE agent_activity_sessions
           SET last_meaningful_action_at = ?,
               last_action_type = ?,
               actions_count = COALESCE(actions_count, 1) + 1
           WHERE id = ?`
        )
        .bind(now, `${actionType}: ${summary}`, activeSession.id)
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO agent_activity_sessions
             (id, organization_id, user_id, user_name, user_role, started_at, last_meaningful_action_at, last_action_type, actions_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        .bind(
          createOpsId('aas'),
          organizationId,
          actor.userId,
          actor.userName,
          actor.userRole,
          now,
          now,
          `${actionType}: ${summary}`
        )
        .run();
    }
  }

  async listOperationalTimeline(
    organizationId: string,
    filters?: {
      dateFrom?: string;
      dateTo?: string;
      actorUserId?: string;
      actorRole?: string;
      eventCategory?: string;
      caseReference?: string;
      productOrService?: string;
      limit?: number;
    }
  ): Promise<OperationalActivityEventRecord[]> {
    const clauses: string[] = ['organization_id = ?'];
    const params: unknown[] = [organizationId];

    if (filters?.dateFrom) {
      clauses.push('created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters?.dateTo) {
      clauses.push('created_at <= ?');
      params.push(filters.dateTo);
    }
    if (filters?.actorUserId && filters.actorUserId !== 'all') {
      clauses.push('(actor_user_id = ? OR LOWER(actor_name) = LOWER(?))');
      params.push(filters.actorUserId, filters.actorUserId);
    }
    if (filters?.actorRole && filters.actorRole !== 'all') {
      clauses.push('LOWER(actor_role) = LOWER(?)');
      params.push(filters.actorRole);
    }
    if (filters?.eventCategory && filters.eventCategory !== 'all') {
      clauses.push('event_category = ?');
      params.push(filters.eventCategory);
    }
    if (filters?.caseReference && filters.caseReference.trim()) {
      clauses.push('LOWER(case_reference) LIKE ?');
      params.push(`%${filters.caseReference.trim().toLowerCase()}%`);
    }
    if (filters?.productOrService && filters.productOrService.trim()) {
      clauses.push('LOWER(product_or_service) LIKE ?');
      params.push(`%${filters.productOrService.trim().toLowerCase()}%`);
    }

    const limit = Math.min(Math.max(filters?.limit ?? 150, 10), 500);

    const { results } = await this.db
      .prepare(
        `SELECT * FROM operational_activity_events
         WHERE ${clauses.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(...params, limit)
      .all<Record<string, unknown>>();

    return results.map((r) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(String(r.metadata_json || '{}'));
      } catch {
        metadata = {};
      }
      return {
        id: String(r.id),
        organizationId: String(r.organization_id),
        eventCategory:
          (r.event_category as OperationalActivityCategory) || 'complaint',
        eventType: String(r.event_type),
        actorUserId: r.actor_user_id ? String(r.actor_user_id) : null,
        actorName: String(r.actor_name),
        actorRole: (r.actor_role as UserRole) || UserRole.Agent,
        caseReference: r.case_reference ? String(r.case_reference) : null,
        complaintId: r.complaint_id ? String(r.complaint_id) : null,
        conversationId: r.conversation_id ? String(r.conversation_id) : null,
        inventoryItemId: r.inventory_item_id ? String(r.inventory_item_id) : null,
        productOrService: r.product_or_service ? String(r.product_or_service) : null,
        summary: String(r.summary),
        metadata,
        createdAt: String(r.created_at),
      };
    });
  }

  /* ==========================================================================
     5. ADMINISTRATOR OPERATIONS DASHBOARD, AGENT/SUPERVISOR ANALYTICS & SLA BACKLOG
  ========================================================================== */

  resolveDateBounds(
    preset: OperationsDatePreset = 'last_30_days',
    customFrom?: string,
    customTo?: string
  ): { fromIso: string; toIso: string } {
    const now = new Date();
    const toIso = customTo ? new Date(customTo).toISOString() : now.toISOString();

    if (preset === 'custom' && customFrom) {
      return {
        fromIso: new Date(customFrom).toISOString(),
        toIso,
      };
    }

    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
    );

    if (preset === 'today') {
      return { fromIso: startOfTodayUtc.toISOString(), toIso };
    }
    if (preset === 'yesterday') {
      const yStart = new Date(startOfTodayUtc.getTime() - 24 * 60 * 60 * 1000);
      return { fromIso: yStart.toISOString(), toIso: startOfTodayUtc.toISOString() };
    }
    if (preset === 'last_7_days') {
      const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { fromIso: d7.toISOString(), toIso };
    }
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { fromIso: d30.toISOString(), toIso };
  }

  async getOperationsDashboardMetrics(
    organizationId: string,
    options?: {
      preset?: OperationsDatePreset;
      fromIso?: string;
      toIso?: string;
    }
  ): Promise<DailyOperationsMetricsDto> {
    await this.expireOutdatedInventoryItems(organizationId);
    const config = await this.getOperationsConfig(organizationId);
    const preset = options?.preset || 'last_30_days';
    const { fromIso, toIso } = this.resolveDateBounds(
      preset,
      options?.fromIso,
      options?.toIso
    );

    const [
      convRowsRes,
      msgRowsRes,
      complaintRowsRes,
      agentRowsRes,
      sessionRowsRes,
      invItemsRes,
      invCategories,
    ] = await Promise.all([
      this.db
        .prepare(
          `SELECT * FROM support_conversations WHERE organization_id = ? ORDER BY updated_at DESC`
        )
        .bind(organizationId)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT id, conversation_id, sender_type, sender_name, sender_user_id, is_internal_note, created_at
           FROM support_messages
           WHERE organization_id = ?
           ORDER BY created_at ASC`
        )
        .bind(organizationId)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT * FROM support_complaints WHERE organization_id = ? ORDER BY created_at DESC`
        )
        .bind(organizationId)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT * FROM support_agents WHERE organization_id = ? AND COALESCE(membership_status, 'active') = 'active'`
        )
        .bind(organizationId)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT * FROM agent_activity_sessions WHERE organization_id = ? ORDER BY last_meaningful_action_at DESC`
        )
        .bind(organizationId)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT id, category_id, category_name, product_or_service, status, reserved_by_name, issued_by_name, issued_at, created_at
           FROM replacement_inventory_items
           WHERE organization_id = ?`
        )
        .bind(organizationId)
        .all<Record<string, unknown>>(),
      this.listInventoryCategories(organizationId),
    ]);

    const allConvs = convRowsRes.results;
    const allMsgs = msgRowsRes.results;
    const allComplaints = complaintRowsRes.results;
    const allAgents = agentRowsRes.results;
    const allSessions = sessionRowsRes.results;
    const allInvItems = invItemsRes.results;

    // Group messages by conversation for first-response calculation & actual handling
    const msgsByConv = new Map<string, Array<Record<string, unknown>>>();
    for (const m of allMsgs) {
      const cid = String(m.conversation_id);
      const arr = msgsByConv.get(cid) || [];
      arr.push(m);
      msgsByConv.set(cid, arr);
    }

    // Filter conversations in period
    const periodConvs = allConvs.filter((c) => {
      const created = String(c.created_at);
      const updated = String(c.updated_at);
      return (created >= fromIso && created <= toIso) || (updated >= fromIso && updated <= toIso);
    });

    const newConvs = allConvs.filter((c) => {
      const created = String(c.created_at);
      return created >= fromIso && created <= toIso;
    });

    // Unique customers attended (customers who received an agent or bot reply or had a complaint handled in period)
    const attendedCustomerKeys = new Set<string>();
    let totalConversationsHandled = 0;
    const firstResponseMinutesList: number[] = [];
    const resolutionHoursList: number[] = [];

    for (const conv of periodConvs) {
      const cid = String(conv.id);
      const convMsgs = msgsByConv.get(cid) || [];
      const agentReplies = convMsgs.filter(
        (m) => String(m.sender_type) === 'agent' && Number(m.is_internal_note ?? 0) === 0
      );
      if (agentReplies.length > 0 || String(conv.status) === 'resolved') {
        totalConversationsHandled++;
        const custKey =
          String(conv.customer_email || '').trim().toLowerCase() ||
          String(conv.customer_name || '').trim().toLowerCase();
        if (custKey) attendedCustomerKeys.add(custKey);
      }

      // First response time: first customer message -> first agent reply
      const firstCustMsg = convMsgs.find((m) => String(m.sender_type) === 'customer');
      const firstAgentMsg = agentReplies[0];
      if (firstCustMsg && firstAgentMsg) {
        const diffMin =
          (new Date(String(firstAgentMsg.created_at)).getTime() -
            new Date(String(firstCustMsg.created_at)).getTime()) /
          60000;
        if (diffMin >= 0 && diffMin < 60 * 24 * 14) {
          firstResponseMinutesList.push(diffMin);
        }
      }

      if (String(conv.status) === 'resolved' || String(conv.status) === 'closed') {
        const diffHrs =
          (new Date(String(conv.updated_at)).getTime() -
            new Date(String(conv.created_at)).getTime()) /
          3600000;
        if (diffHrs >= 0 && diffHrs < 24 * 60) {
          resolutionHoursList.push(diffHrs);
        }
      }
    }

    const periodComplaints = allComplaints.filter((c) => {
      const created = String(c.created_at);
      const updated = String(c.updated_at);
      return (created >= fromIso && created <= toIso) || (updated >= fromIso && updated <= toIso);
    });

    for (const clm of periodComplaints) {
      const custKey =
        String(clm.customer_email || '').trim().toLowerCase() ||
        String(clm.customer_name || '').trim().toLowerCase();
      if (custKey) attendedCustomerKeys.add(custKey);
    }

    const avgFirstResponseMinutes =
      firstResponseMinutesList.length > 0
        ? Math.round(
            (firstResponseMinutesList.reduce((a, b) => a + b, 0) /
              firstResponseMinutesList.length) *
              10
          ) / 10
        : null;

    const avgResolutionHours =
      resolutionHoursList.length > 0
        ? Math.round(
            (resolutionHoursList.reduce((a, b) => a + b, 0) / resolutionHoursList.length) * 10
          ) / 10
        : null;

    const openConversationsCount = allConvs.filter(
      (c) => String(c.status) !== 'resolved' && String(c.status) !== 'closed'
    ).length;

    const resolvedConversationsCount = periodConvs.filter(
      (c) => String(c.status) === 'resolved' || String(c.status) === 'closed'
    ).length;

    const escalatedTicketsNew = periodConvs.filter(
      (c) => Number(c.escalation_count ?? 0) > 0 || String(c.status) === 'escalated'
    ).length;
    const escalatedTicketsClosed = periodConvs.filter(
      (c) =>
        (Number(c.escalation_count ?? 0) > 0 || String(c.status) === 'resolved') &&
        (String(c.status) === 'resolved' || String(c.status) === 'closed')
    ).length;

    const newComplaintsCount = allComplaints.filter(
      (c) => String(c.created_at) >= fromIso && String(c.created_at) <= toIso
    ).length;
    const approvedComplaintsCount = periodComplaints.filter(
      (c) =>
        String(c.decision) === 'approved' ||
        String(c.status) === 'approved' ||
        String(c.status) === 'awaiting_replacement' ||
        String(c.resolution_type) === 'replacement_issued'
    ).length;
    const declinedComplaintsCount = periodComplaints.filter(
      (c) => String(c.decision) === 'declined' || String(c.status) === 'declined'
    ).length;
    const pendingVerificationCount = allComplaints.filter(
      (c) =>
        String(c.status) === 'submitted' ||
        String(c.status) === 'pending_review' ||
        String(c.status) === 'in_progress'
    ).length;
    const replacementsIssuedCount = allInvItems.filter(
      (i) =>
        String(i.status) === 'ISSUED' &&
        (!i.issued_at || (String(i.issued_at) >= fromIso && String(i.issued_at) <= toIso))
    ).length;

    // B. Agent Performance Calculation (distinguishing assigned vs actually handled vs unique customers attended)
    const nowMs = Date.now();
    const inactivityMs = config.inactivityTimeoutMinutes * 60 * 1000;

    const agentPerformance = allAgents.map((ag) => {
      const agId = String(ag.id);
      const agUserId = ag.user_id ? String(ag.user_id) : null;
      const agName = String(ag.display_name);
      const agNameLower = agName.toLowerCase();

      const latestSession = allSessions.find(
        (s) =>
          (agUserId && String(s.user_id) === agUserId) ||
          String(s.user_name).toLowerCase() === agNameLower
      );
      const lastActionAt = latestSession
        ? String(latestSession.last_meaningful_action_at)
        : null;
      const lastActionSummary = latestSession ? String(latestSession.last_action_type) : null;

      let activityStatus: 'actively_working' | 'idle' | 'inactive' = 'inactive';
      if (lastActionAt) {
        const elapsed = nowMs - new Date(lastActionAt).getTime();
        if (elapsed <= inactivityMs) activityStatus = 'actively_working';
        else if (elapsed <= inactivityMs * 3) activityStatus = 'idle';
      }

      const assignedConvs = allConvs.filter(
        (c) =>
          (agUserId && String(c.assigned_agent_id) === agUserId) ||
          String(c.assigned_agent_name || '').toLowerCase() === agNameLower
      );

      // Conversations actually handled = conversations where this agent sent at least 1 message
      const handledConvIds = new Set<string>();
      const agentCustomerSet = new Set<string>();
      const agentRespMinutes: number[] = [];

      for (const conv of periodConvs) {
        const cid = String(conv.id);
        const msgs = msgsByConv.get(cid) || [];
        const sentByThisAgent = msgs.filter(
          (m) =>
            String(m.sender_type) === 'agent' &&
            ((agUserId && String(m.sender_user_id) === agUserId) ||
              String(m.sender_name || '').toLowerCase() === agNameLower)
        );
        if (sentByThisAgent.length > 0) {
          handledConvIds.add(cid);
          const custKey =
            String(conv.customer_email || '').trim().toLowerCase() ||
            String(conv.customer_name || '').trim().toLowerCase();
          if (custKey) agentCustomerSet.add(custKey);

          const firstCust = msgs.find((m) => String(m.sender_type) === 'customer');
          if (firstCust && sentByThisAgent[0]) {
            const dMin =
              (new Date(String(sentByThisAgent[0].created_at)).getTime() -
                new Date(String(firstCust.created_at)).getTime()) /
              60000;
            if (dMin >= 0 && dMin < 60 * 24 * 7) agentRespMinutes.push(dMin);
          }
        }
      }

      const resolvedByAgent = assignedConvs.filter(
        (c) => String(c.status) === 'resolved' || String(c.status) === 'closed'
      ).length;
      const openTicketsForAgent = assignedConvs.filter(
        (c) => String(c.status) !== 'resolved' && String(c.status) !== 'closed'
      ).length;

      const submittedComplaints = periodComplaints.filter(
        (c) =>
          (agUserId && String(c.created_by_user_id) === agUserId) ||
          String(c.created_by_name || '').toLowerCase() === agNameLower
      ).length;

      const escalatedCases = periodComplaints.filter(
        (c) =>
          ((agUserId && String(c.assigned_agent_id) === agUserId) ||
            String(c.assigned_agent_name || '').toLowerCase() === agNameLower) &&
          Boolean(c.escalated_at)
      ).length;

      const deliveredByAgent = allInvItems.filter(
        (i) =>
          String(i.status) === 'ISSUED' &&
          String(i.issued_by_name || '').toLowerCase() === agNameLower
      ).length;

      return {
        agentId: agId,
        userId: agUserId,
        displayName: agName,
        email: String(ag.email),
        role: (ag.role as UserRole) || UserRole.Agent,
        department: String(ag.department || 'Support'),
        availabilityIndicator: String(ag.availability || 'available'),
        activityStatus,
        lastMeaningfulActionAt: lastActionAt,
        lastActionSummary,
        assignedConversations: assignedConvs.length,
        conversationsHandled: handledConvIds.size,
        uniqueCustomersAttended: agentCustomerSet.size,
        conversationsResolved: resolvedByAgent,
        openTickets: openTicketsForAgent,
        ticketsResolved: resolvedByAgent,
        complaintsSubmitted: submittedComplaints,
        casesEscalated: escalatedCases,
        replacementsDelivered: deliveredByAgent,
        avgFirstResponseMinutes:
          agentRespMinutes.length > 0
            ? Math.round(
                (agentRespMinutes.reduce((a, b) => a + b, 0) / agentRespMinutes.length) * 10
              ) / 10
            : null,
        avgResolutionHours,
      };
    });

    // C. Supervisor Performance Calculation
    const supervisors = allAgents.filter(
      (a) =>
        String(a.role) === 'supervisor' ||
        String(a.role) === 'admin' ||
        String(a.role) === 'owner'
    );

    const supervisorPerformance = supervisors.map((sup) => {
      const supId = String(sup.id);
      const supUserId = sup.user_id ? String(sup.user_id) : null;
      const supName = String(sup.display_name);
      const supNameLower = supName.toLowerCase();

      const assignedToSup = allComplaints.filter(
        (c) =>
          (supUserId && String(c.assigned_supervisor_id) === supUserId) ||
          String(c.assigned_supervisor_name || '').toLowerCase() === supNameLower
      );

      const reviewedBySup = allComplaints.filter(
        (c) =>
          (supUserId && String(c.reviewed_by_supervisor_id) === supUserId) ||
          String(c.reviewed_by_supervisor_name || '').toLowerCase() === supNameLower
      );

      const approvedBySup = reviewedBySup.filter(
        (c) => String(c.decision) === 'approved'
      ).length;
      const declinedBySup = reviewedBySup.filter(
        (c) => String(c.decision) === 'declined'
      ).length;
      const pendingForSup = assignedToSup.filter(
        (c) =>
          String(c.status) === 'pending_review' || String(c.status) === 'in_progress'
      ).length;
      const replacementApprovals = reviewedBySup.filter(
        (c) =>
          String(c.decision) === 'approved' &&
          (String(c.resolution_type) === 'replacement_authorized' ||
            String(c.resolution_type) === 'replacement_issued' ||
            Boolean(c.allocated_replacement_id))
      ).length;

      const verifMins: number[] = [];
      for (const c of reviewedBySup) {
        const startIso = String(c.escalated_at || c.created_at);
        const endIso = String(c.reviewed_at || '');
        if (startIso && endIso) {
          const dMin =
            (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
          if (dMin >= 0 && dMin < 60 * 24 * 30) verifMins.push(dMin);
        }
      }

      return {
        supervisorId: supId,
        userId: supUserId,
        displayName: supName,
        email: String(sup.email),
        role: (sup.role as UserRole) || UserRole.Supervisor,
        complaintsReceived: assignedToSup.length,
        complaintsReviewed: reviewedBySup.length,
        complaintsApproved: approvedBySup,
        complaintsDeclined: declinedBySup,
        pendingInvestigations: pendingForSup,
        reassignedCases: 0,
        replacementApprovals,
        outstandingCases: assignedToSup.filter((c) => String(c.status) !== 'resolved').length,
        avgVerificationMinutes:
          verifMins.length > 0
            ? Math.round((verifMins.reduce((a, b) => a + b, 0) / verifMins.length) * 10) / 10
            : null,
      };
    });

    // D. Complaint Analytics & Anomaly Detection
    const catCountMap = new Map<string, number>();
    const prodStatsMap = new Map<string, { count: number; approvedCount: number }>();
    const agentComplaintMap = new Map<string, number>();
    const supReviewMap = new Map<
      string,
      { reviewedCount: number; approvedCount: number; declinedCount: number }
    >();
    const investigationMins: number[] = [];

    for (const c of allComplaints) {
      const cat = String(c.category_name || 'General');
      catCountMap.set(cat, (catCountMap.get(cat) || 0) + 1);

      const prod = String(c.product_or_service || 'Unspecified');
      const pStat = prodStatsMap.get(prod) || { count: 0, approvedCount: 0 };
      pStat.count++;
      if (String(c.decision) === 'approved') pStat.approvedCount++;
      prodStatsMap.set(prod, pStat);

      const agName = String(c.assigned_agent_name || c.created_by_name || 'Unassigned');
      agentComplaintMap.set(agName, (agentComplaintMap.get(agName) || 0) + 1);

      if (c.reviewed_by_supervisor_name) {
        const sName = String(c.reviewed_by_supervisor_name);
        const sStat = supReviewMap.get(sName) || {
          reviewedCount: 0,
          approvedCount: 0,
          declinedCount: 0,
        };
        sStat.reviewedCount++;
        if (String(c.decision) === 'approved') sStat.approvedCount++;
        if (String(c.decision) === 'declined') sStat.declinedCount++;
        supReviewMap.set(sName, sStat);
      }

      if (c.reviewed_at) {
        const start = String(c.escalated_at || c.created_at);
        const diffMin =
          (new Date(String(c.reviewed_at)).getTime() - new Date(start).getTime()) / 60000;
        if (diffMin >= 0 && diffMin < 60 * 24 * 30) investigationMins.push(diffMin);
      }
    }

    const totalComplaintsAll = allComplaints.length;
    const byProduct = Array.from(prodStatsMap.entries())
      .map(([productOrService, st]) => ({
        productOrService,
        count: st.count,
        approvedCount: st.approvedCount,
        isHighVolumeAnomaly:
          st.count >= 3 && st.count / Math.max(totalComplaintsAll, 1) >= 0.35,
      }))
      .sort((a, b) => b.count - a.count);

    // E. Replacement Inventory Analytics
    const invStatusCounts: Record<ReplacementInventoryStatus, number> = {
      AVAILABLE: 0,
      RESERVED: 0,
      ISSUED: 0,
      EXPIRED: 0,
      INVALID: 0,
      WITHDRAWN: 0,
    };
    const consumptionByProdMap = new Map<
      string,
      { issuedCount: number; reservedCount: number; availableCount: number }
    >();
    const issuanceByAgentMap = new Map<string, number>();

    for (const item of allInvItems) {
      const st = (item.status as ReplacementInventoryStatus) || 'AVAILABLE';
      invStatusCounts[st] = (invStatusCounts[st] || 0) + 1;

      const prod = String(item.product_or_service || 'General');
      const pEntry = consumptionByProdMap.get(prod) || {
        issuedCount: 0,
        reservedCount: 0,
        availableCount: 0,
      };
      if (st === 'ISSUED') pEntry.issuedCount++;
      if (st === 'RESERVED') pEntry.reservedCount++;
      if (st === 'AVAILABLE') pEntry.availableCount++;
      consumptionByProdMap.set(prod, pEntry);

      if (st === 'ISSUED' && item.issued_by_name) {
        const issuer = String(item.issued_by_name);
        issuanceByAgentMap.set(issuer, (issuanceByAgentMap.get(issuer) || 0) + 1);
      }
    }

    // F. Open Issues & SLA Backlog Monitoring
    const backlogRecords: DailyOperationsMetricsDto['backlogQueues']['records'] = [];

    for (const conv of allConvs) {
      const st = String(conv.status);
      if (st === 'resolved' || st === 'closed') continue;

      const createdMs = new Date(String(conv.created_at)).getTime();
      const updatedMs = new Date(String(conv.updated_at)).getTime();
      const ageHours = Math.round(((nowMs - createdMs) / 3600000) * 10) / 10;
      const hoursSinceLastUpdate = Math.round(((nowMs - updatedMs) / 3600000) * 10) / 10;
      const isUnassigned = !conv.assigned_agent_name && !conv.assigned_agent_id;

      backlogRecords.push({
        id: String(conv.id),
        referenceCode: String(conv.id).slice(0, 12).toUpperCase(),
        recordType: 'conversation',
        customerName: String(conv.customer_name),
        subjectOrProduct: String(conv.subject),
        status: st,
        priority: String(conv.priority || 'normal'),
        assignedTo: String(conv.assigned_agent_name || 'Unassigned'),
        ageHours,
        hoursSinceLastUpdate,
        isOverdue24h: ageHours >= config.slaResolutionHours,
        isOverdue48h: ageHours >= config.slaOverdueHours,
        isUnassigned,
        isReopened: false,
        createdAt: String(conv.created_at),
        updatedAt: String(conv.updated_at),
      });
    }

    for (const clm of allComplaints) {
      const st = String(clm.status);
      if (st === 'resolved' || st === 'declined') continue;

      const createdMs = new Date(String(clm.created_at)).getTime();
      const updatedMs = new Date(String(clm.updated_at)).getTime();
      const ageHours = Math.round(((nowMs - createdMs) / 3600000) * 10) / 10;
      const hoursSinceLastUpdate = Math.round(((nowMs - updatedMs) / 3600000) * 10) / 10;
      const isUnassigned = !clm.assigned_supervisor_name && !clm.assigned_agent_name;

      backlogRecords.push({
        id: String(clm.id),
        referenceCode: String(clm.reference_code),
        recordType: 'complaint',
        customerName: String(clm.customer_name),
        subjectOrProduct: `${String(clm.product_or_service)} (${String(clm.category_name)})`,
        status: st,
        priority: String(clm.priority || 'normal'),
        assignedTo: String(
          clm.assigned_supervisor_name || clm.assigned_agent_name || 'Unassigned'
        ),
        ageHours,
        hoursSinceLastUpdate,
        isOverdue24h: ageHours >= config.slaResolutionHours,
        isOverdue48h: ageHours >= config.slaOverdueHours,
        isUnassigned,
        isReopened: Number(clm.reopened_count ?? 0) > 0,
        createdAt: String(clm.created_at),
        updatedAt: String(clm.updated_at),
      });
    }

    const unassignedConversations = allConvs.filter(
      (c) =>
        String(c.status) !== 'resolved' &&
        String(c.status) !== 'closed' &&
        !c.assigned_agent_name
    ).length;

    const conversationsAwaitingAgentResponse = allConvs.filter((c) => {
      const st = String(c.status);
      if (st === 'resolved' || st === 'closed') return false;
      const msgs = msgsByConv.get(String(c.id)) || [];
      const lastMsg = msgs[msgs.length - 1];
      return !lastMsg || String(lastMsg.sender_type) === 'customer';
    }).length;

    const complaintsAwaitingSupervisorReview = allComplaints.filter(
      (c) => String(c.status) === 'pending_review' || String(c.status) === 'in_progress'
    ).length;
    const complaintsAwaitingCustomerInfo = allComplaints.filter(
      (c) => String(c.status) === 'awaiting_information'
    ).length;
    const approvedComplaintsAwaitingReplacement = allComplaints.filter(
      (c) => String(c.status) === 'awaiting_replacement' && !c.allocated_replacement_id
    ).length;
    const replacementsAwaitingDelivery = allComplaints.filter(
      (c) =>
        (String(c.status) === 'approved' ||
          String(c.status) === 'awaiting_replacement') &&
        Boolean(c.allocated_replacement_id) &&
        !c.delivered_at
    ).length;

    return {
      dateRange: {
        preset,
        fromIso,
        toIso,
        timezone: config.timezone,
      },
      overview: {
        uniqueCustomersAttended: attendedCustomerKeys.size,
        newConversations: newConvs.length,
        totalConversationsHandled,
        resolvedConversations: resolvedConversationsCount,
        openConversations: openConversationsCount,
        newTickets: escalatedTicketsNew,
        closedTickets: escalatedTicketsClosed,
        newComplaints: newComplaintsCount,
        approvedComplaints: approvedComplaintsCount,
        declinedComplaints: declinedComplaintsCount,
        pendingVerificationComplaints: pendingVerificationCount,
        replacementsIssued: replacementsIssuedCount,
        avgFirstResponseMinutes,
        avgResolutionHours,
        customerSatisfactionScore: null,
      },
      agentPerformance,
      supervisorPerformance,
      complaintAnalytics: {
        totalComplaints: allComplaints.length,
        approvedCount: allComplaints.filter((c) => String(c.decision) === 'approved').length,
        declinedCount: allComplaints.filter((c) => String(c.decision) === 'declined').length,
        pendingVerificationCount,
        repeatedOrderComplaintsCount: allComplaints.filter(
          (c) => Number(c.is_potential_duplicate ?? 0) === 1
        ).length,
        avgInvestigationMinutes:
          investigationMins.length > 0
            ? Math.round(
                (investigationMins.reduce((a, b) => a + b, 0) / investigationMins.length) * 10
              ) / 10
            : null,
        byCategory: Array.from(catCountMap.entries()).map(([category, count]) => ({
          category,
          count,
        })),
        byProduct,
        byAgent: Array.from(agentComplaintMap.entries()).map(([agentName, count]) => ({
          agentName,
          count,
        })),
        bySupervisor: Array.from(supReviewMap.entries()).map(([supervisorName, st]) => ({
          supervisorName,
          ...st,
        })),
      },
      inventoryAnalytics: {
        totalStock: allInvItems.length,
        availableStock: invStatusCounts.AVAILABLE,
        reservedStock: invStatusCounts.RESERVED,
        issuedStock: invStatusCounts.ISSUED,
        expiredStock: invStatusCounts.EXPIRED,
        invalidStock: invStatusCounts.INVALID,
        withdrawnStock: invStatusCounts.WITHDRAWN,
        lowStockCategories: invCategories.filter((c) => c.isLowStock),
        consumptionByProduct: Array.from(consumptionByProdMap.entries()).map(
          ([productOrService, st]) => ({
            productOrService,
            ...st,
          })
        ),
        issuanceByAgent: Array.from(issuanceByAgentMap.entries()).map(
          ([agentName, count]) => ({
            agentName,
            count,
          })
        ),
        approvalsBySupervisor: supervisorPerformance.map((s) => ({
          supervisorName: s.displayName,
          count: s.replacementApprovals,
        })),
      },
      backlogQueues: {
        unassignedConversations,
        conversationsAwaitingAgentResponse,
        ticketsAwaitingResolution: openConversationsCount,
        complaintsAwaitingSupervisorReview,
        complaintsAwaitingCustomerInfo,
        approvedComplaintsAwaitingReplacement,
        replacementsAwaitingDelivery,
        overdueCases24h: backlogRecords.filter((r) => r.isOverdue24h).length,
        overdueCases48h: backlogRecords.filter((r) => r.isOverdue48h).length,
        casesWithoutUpdates24h: backlogRecords.filter((r) => r.hoursSinceLastUpdate >= 24)
          .length,
        reopenedCases: backlogRecords.filter((r) => r.isReopened).length,
        records: backlogRecords,
      },
    };
  }

  /* ==========================================================================
     6. DAILY, WEEKLY & MONTHLY CLOSING REPORTS (FROM ACTUAL RECORDS)
  ========================================================================== */

  async generateClosingReport(
    organizationId: string,
    options?: {
      period?: 'daily' | 'weekly' | 'monthly';
      fromIso?: string;
      toIso?: string;
    }
  ): Promise<DailyClosingReportDto> {
    const period = options?.period || 'daily';
    const preset: OperationsDatePreset =
      period === 'daily'
        ? 'today'
        : period === 'weekly'
          ? 'last_7_days'
          : 'last_30_days';

    // Use last_30_days fallback if today has 0 records and no explicit bounds were passed,
    // while still accurately reporting the window
    const metrics = await this.getOperationsDashboardMetrics(organizationId, {
      preset: options?.fromIso ? 'custom' : preset,
      fromIso: options?.fromIso,
      toIso: options?.toIso,
    });

    const orgRow = await this.db
      .prepare(`SELECT name FROM organizations WHERE id = ?`)
      .bind(organizationId)
      .first<{ name: string }>();

    const movements = await this.listInventoryMovements(organizationId, 200);
    const periodMovements = movements.filter(
      (m) =>
        m.createdAt >= metrics.dateRange.fromIso && m.createdAt <= metrics.dateRange.toIso
    );

    const inventoryAdded = periodMovements.filter(
      (m) => m.movementType === 'added' || m.movementType === 'bulk_imported'
    ).length;
    const inventoryAdjusted = periodMovements.filter(
      (m) =>
        m.movementType === 'marked_expired' ||
        m.movementType === 'marked_invalid' ||
        m.movementType === 'withdrawn'
    ).length;

    const observations: string[] = [];
    if (metrics.backlogQueues.complaintsAwaitingSupervisorReview > 0) {
      observations.push(
        `${metrics.backlogQueues.complaintsAwaitingSupervisorReview} complaint(s) are currently awaiting supervisor verification.`
      );
    }
    if (metrics.backlogQueues.approvedComplaintsAwaitingReplacement > 0) {
      observations.push(
        `${metrics.backlogQueues.approvedComplaintsAwaitingReplacement} approved complaint(s) are awaiting replacement allocation.`
      );
    }
    if (metrics.backlogQueues.replacementsAwaitingDelivery > 0) {
      observations.push(
        `${metrics.backlogQueues.replacementsAwaitingDelivery} reserved replacement(s) are awaiting final customer delivery confirmation.`
      );
    }
    if (metrics.inventoryAnalytics.lowStockCategories.length > 0) {
      observations.push(
        `Low replacement stock alert on ${metrics.inventoryAnalytics.lowStockCategories.map((c) => c.name).join(', ')}.`
      );
    }
    const highAnomalyProds = metrics.complaintAnalytics.byProduct.filter(
      (p) => p.isHighVolumeAnomaly
    );
    if (highAnomalyProds.length > 0) {
      observations.push(
        `Elevated complaint volume detected for: ${highAnomalyProds.map((p) => `${p.productOrService} (${p.count})`).join(', ')}.`
      );
    }
    if (observations.length === 0) {
      observations.push(
        'All support queues, supervisor verifications, and replacement stock levels are operating within normal thresholds.'
      );
    }

    const config = await this.getOperationsConfig(organizationId);

    return {
      generatedAt: new Date().toISOString(),
      reportPeriodLabel:
        period === 'daily'
          ? 'Daily Operations & Closing Summary'
          : period === 'weekly'
            ? 'Weekly Operations Summary (7 Days)'
            : 'Monthly Operations Summary (30 Days)',
      fromIso: metrics.dateRange.fromIso,
      toIso: metrics.dateRange.toIso,
      timezone: config.timezone,
      closingTime: config.businessClosingTime,
      organizationName: orgRow?.name || organizationId,
      summary: {
        customersAttended: metrics.overview.uniqueCustomersAttended,
        conversationsReceived: metrics.overview.newConversations,
        conversationsResolved: metrics.overview.resolvedConversations,
        outstandingConversations: metrics.overview.openConversations,
        complaintsReceived: metrics.overview.newComplaints,
        complaintsApproved: metrics.overview.approvedComplaints,
        complaintsDeclined: metrics.overview.declinedComplaints,
        pendingInvestigations: metrics.overview.pendingVerificationComplaints,
        replacementsIssued: metrics.overview.replacementsIssued,
        inventoryAdded,
        inventoryAdjusted,
        overdueCasesCount: metrics.backlogQueues.overdueCases24h,
      },
      agentActivitySummary: metrics.agentPerformance.map((a) => ({
        agentName: a.displayName,
        role: a.role,
        conversationsHandled: a.conversationsHandled,
        conversationsResolved: a.conversationsResolved,
        complaintsSubmitted: a.complaintsSubmitted,
        replacementsDelivered: a.replacementsDelivered,
        lastMeaningfulActionAt: a.lastMeaningfulActionAt,
      })),
      supervisorActivitySummary: metrics.supervisorPerformance.map((s) => ({
        supervisorName: s.displayName,
        complaintsReviewed: s.complaintsReviewed,
        complaintsApproved: s.complaintsApproved,
        complaintsDeclined: s.complaintsDeclined,
        pendingInvestigations: s.pendingInvestigations,
      })),
      outstandingCases: metrics.backlogQueues.records.slice(0, 50).map((r) => ({
        referenceCode: r.referenceCode,
        type: r.recordType,
        customerName: r.customerName,
        status: r.status,
        priority: r.priority,
        assignedTo: r.assignedTo,
        ageHours: r.ageHours,
      })),
      observations,
    };
  }
}
