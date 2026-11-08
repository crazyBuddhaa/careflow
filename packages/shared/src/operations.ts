import { EscalationPriority, UserRole } from './types';

export type ClaimStatus =
  | 'submitted'
  | 'pending_review'
  | 'in_progress'
  | 'awaiting_information'
  | 'approved'
  | 'awaiting_replacement'
  | 'declined'
  | 'resolved';

export type ClaimDecisionType = 'approved' | 'declined' | 'info_requested';

export type ReplacementInventoryStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ISSUED'
  | 'EXPIRED'
  | 'INVALID'
  | 'WITHDRAWN';

export type ReplacementFulfilmentMethod =
  | 'supervisor_controlled'
  | 'agent_assisted'
  | 'both';

export interface OrganizationOperationsConfig {
  organizationId: string;
  timezone: string;
  businessClosingTime: string;
  fulfilmentMethod: ReplacementFulfilmentMethod;
  allowAgentDirectApproval: boolean;
  autoAssignSupervisor: boolean;
  slaFirstResponseMinutes: number;
  slaResolutionHours: number;
  slaOverdueHours: number;
  inactivityTimeoutMinutes: number;
  updatedAt: string;
}

export interface ComplaintCustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
}

export interface ComplaintCategoryRecord {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string;
  requiresOrderId: boolean;
  requiresLoginInfo: boolean;
  requiresEvidence: boolean;
  customFields: ComplaintCustomFieldDefinition[];
  defaultPriority: EscalationPriority;
  autoEscalateToSupervisor: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintEvidenceRecord {
  id: string;
  organizationId: string;
  complaintId: string;
  fileName: string;
  mimeType: string;
  fileUrlOrData: string;
  description: string;
  uploadedByUserId?: string | null;
  uploadedByName: string;
  uploadedByRole: UserRole;
  createdAt: string;
}

export type ComplaintCommentType =
  | 'internal_note'
  | 'escalation_note'
  | 'supervisor_instruction'
  | 'decision_reason'
  | 'info_request'
  | 'customer_update';

export interface ComplaintInternalCommentRecord {
  id: string;
  organizationId: string;
  complaintId: string;
  authorUserId?: string | null;
  authorName: string;
  authorRole: UserRole;
  commentType: ComplaintCommentType;
  body: string;
  isVisibleToCustomer: boolean;
  createdAt: string;
}

export interface ComplaintAssignmentHistoryRecord {
  id: string;
  organizationId: string;
  complaintId: string;
  fromUserId?: string | null;
  fromUserName?: string | null;
  toUserId?: string | null;
  toUserName: string;
  assignmentRole: 'agent' | 'supervisor' | 'specialist';
  reason: string;
  actorUserId?: string | null;
  actorName: string;
  createdAt: string;
}

export interface SupportComplaintRecord {
  id: string;
  referenceCode: string;
  organizationId: string;
  conversationId?: string | null;
  ticketId?: string | null;
  customerId?: string | null;
  customerName: string;
  customerEmail: string;
  orderId: string;
  productOrService: string;
  categoryId?: string | null;
  categoryName: string;
  status: ClaimStatus;
  priority: EscalationPriority;
  description: string;
  hasEncryptedLoginInfo: boolean;
  loginInfoMasked: string;
  /**
   * Populated ONLY when explicitly requested via secure credential reveal endpoint
   * by an authorized Agent/Supervisor/Admin. Never returned in general list queries.
   */
  decryptedLoginInfo?: string | null;
  customFields: Record<string, string>;
  duplicateOfComplaintId?: string | null;
  duplicateReferenceCode?: string | null;
  isPotentialDuplicate: boolean;
  createdByUserId?: string | null;
  createdByName: string;
  createdByRole: UserRole;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  assignedSupervisorId?: string | null;
  assignedSupervisorName?: string | null;
  assignedSpecialistName?: string | null;
  assignedSpecialistDepartment?: string | null;
  slaDeadlineAt?: string | null;
  escalatedAt?: string | null;
  reviewedBySupervisorId?: string | null;
  reviewedBySupervisorName?: string | null;
  reviewedAt?: string | null;
  decision?: ClaimDecisionType | null;
  decisionReason?: string | null;
  resolutionType?: string | null;
  resolutionSummary?: string | null;
  allocatedReplacementId?: string | null;
  allocatedReplacementMasked?: string | null;
  allocatedReplacementStatus?: ReplacementInventoryStatus | null;
  deliveredAt?: string | null;
  resolvedAt?: string | null;
  reopenedCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  evidence?: ComplaintEvidenceRecord[];
  comments?: ComplaintInternalCommentRecord[];
  assignmentHistory?: ComplaintAssignmentHistoryRecord[];
  previousOrderComplaintsCount?: number;
}

export interface ReplacementInventoryCategoryRecord {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  productOrService: string;
  description: string;
  minStockThreshold: number;
  availableCount: number;
  reservedCount: number;
  issuedCount: number;
  expiredCount: number;
  invalidCount: number;
  withdrawnCount: number;
  isLowStock: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReplacementStockBatchRecord {
  id: string;
  organizationId: string;
  categoryId: string;
  categoryName?: string;
  batchCode: string;
  productOrService: string;
  supplierRef: string;
  totalAdded: number;
  notes: string;
  createdByUserId?: string | null;
  createdByName: string;
  createdAt: string;
}

export interface ReplacementInventoryItemRecord {
  id: string;
  organizationId: string;
  categoryId: string;
  categoryName: string;
  batchId?: string | null;
  batchCode?: string | null;
  productOrService: string;
  identifierMasked: string;
  supplierRef: string;
  status: ReplacementInventoryStatus;
  expiresAt?: string | null;
  associatedComplaintId?: string | null;
  associatedComplaintRef?: string | null;
  associatedOrderId?: string | null;
  reservedByUserId?: string | null;
  reservedByName?: string | null;
  reservedAt?: string | null;
  issuedByUserId?: string | null;
  issuedByName?: string | null;
  issuedAt?: string | null;
  addedByUserId?: string | null;
  addedByName: string;
  createdAt: string;
  updatedAt: string;
}

export type InventoryMovementType =
  | 'added'
  | 'bulk_imported'
  | 'updated'
  | 'reserved'
  | 'reservation_released'
  | 'issued'
  | 'marked_expired'
  | 'marked_invalid'
  | 'withdrawn';

export interface ReplacementInventoryMovementRecord {
  id: string;
  organizationId: string;
  inventoryItemId: string;
  identifierMasked?: string;
  productOrService?: string;
  batchId?: string | null;
  movementType: InventoryMovementType;
  previousStatus?: ReplacementInventoryStatus | null;
  newStatus: ReplacementInventoryStatus;
  complaintId?: string | null;
  complaintRef?: string | null;
  orderId?: string | null;
  actorUserId?: string | null;
  actorName: string;
  actorRole: UserRole;
  notes: string;
  createdAt: string;
}

export type OperationalActivityCategory =
  | 'agent_activity'
  | 'conversation'
  | 'ticket'
  | 'complaint'
  | 'supervisor'
  | 'inventory'
  | 'replacement'
  | 'report'
  | 'settings';

export interface OperationalActivityEventRecord {
  id: string;
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
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type OperationsDatePreset = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'custom';

export interface QaEvaluationRecord {
  id: string;
  organizationId: string;
  conversationId?: string | null;
  complaintId?: string | null;
  caseReference: string;
  agentId: string;
  agentName: string;
  evaluatorUserId?: string | null;
  evaluatorName: string;
  accuracyScore: number; // 1-5
  professionalismScore: number; // 1-5
  resolutionEffectivenessScore: number; // 1-5
  overallScore: number; // 0-100
  caseComplexity: 'low' | 'standard' | 'complex';
  feedbackNotes: string;
  coachingRecommendations: string;
  createdAt: string;
}

export interface AgentScorecardDto {
  agentId: string;
  userId?: string | null;
  displayName: string;
  email: string;
  role: UserRole;
  department: string;
  dailyHandled: number;
  weeklyHandled: number;
  monthlyHandled: number;
  weeklyTarget: number;
  resolutionRatePercent: number | null;
  escalationRatePercent: number | null;
  reopenedCasesCount: number;
  pendingCasesCount: number;
  slaCompliancePercent: number | null;
  avgFirstResponseMinutes: number | null;
  avgResolutionHours: number | null;
  avgQaScore: number | null;
  qaEvaluationsCount: number;
  avgCsatScore: number | null;
  workloadComplexityScore: number;
}

export interface CustomerFeedbackRecord {
  id: string;
  organizationId: string;
  conversationId?: string | null;
  complaintId?: string | null;
  caseReference: string;
  customerName: string;
  customerEmail: string;
  channel: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
}

export type AutomationRuleType =
  | 'auto_assign_enquiry'
  | 'auto_categorise_enquiry'
  | 'auto_escalate_condition'
  | 'notify_supervisor_overdue'
  | 'reassign_unavailable_agent'
  | 'notify_agent_sla_warning'
  | 'notify_customer_status_change'
  | 'trigger_pending_followup';

export interface WorkflowAutomationRuleRecord {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  ruleType: AutomationRuleType;
  triggerEvent: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  isEnabled: boolean;
  priorityOrder: number;
  executionCount: number;
  lastTriggeredAt?: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAutomationLogRecord {
  id: string;
  organizationId: string;
  ruleId: string;
  ruleName: string;
  ruleType: AutomationRuleType;
  targetType: 'conversation' | 'complaint' | 'agent' | 'system';
  targetId: string;
  targetReference: string;
  actionSummary: string;
  actorName: string;
  createdAt: string;
}

export interface DailyOperationsMetricsDto {
  dateRange: {
    preset: OperationsDatePreset;
    fromIso: string;
    toIso: string;
    timezone: string;
  };
  overview: {
    uniqueCustomersAttended: number;
    newConversations: number;
    totalConversationsHandled: number;
    resolvedConversations: number;
    openConversations: number;
    newTickets: number;
    closedTickets: number;
    newComplaints: number;
    approvedComplaints: number;
    declinedComplaints: number;
    pendingVerificationComplaints: number;
    replacementsIssued: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionHours: number | null;
    customerSatisfactionScore: number | null;
    slaCompliancePercentage?: number | null;
    escalatedCasesCount?: number;
  };
  channelAnalytics?: Array<{
    channel: string;
    label: string;
    totalConversations: number;
    openCount: number;
    resolvedCount: number;
    escalatedCount: number;
  }>;
  trendAnalytics?: Array<{
    dateLabel: string;
    isoDate: string;
    newConversations: number;
    resolvedConversations: number;
    newComplaints: number;
    resolvedComplaints: number;
    backlogCount: number;
  }>;
  agentPerformance: Array<{
    agentId: string;
    userId?: string | null;
    displayName: string;
    email: string;
    role: UserRole;
    department: string;
    availabilityIndicator: string;
    activityStatus: 'actively_working' | 'idle' | 'inactive';
    lastMeaningfulActionAt?: string | null;
    lastActionSummary?: string | null;
    assignedConversations: number;
    conversationsHandled: number;
    uniqueCustomersAttended: number;
    conversationsResolved: number;
    openTickets: number;
    ticketsResolved: number;
    complaintsSubmitted: number;
    casesEscalated: number;
    replacementsDelivered: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionHours: number | null;
    slaCompliancePercent?: number | null;
    resolutionRatePercent?: number | null;
    escalationRatePercent?: number | null;
    reopenedCount?: number;
    avgQaScore?: number | null;
    avgCsatScore?: number | null;
  }>;
  supervisorPerformance: Array<{
    supervisorId: string;
    userId?: string | null;
    displayName: string;
    email: string;
    role: UserRole;
    complaintsReceived: number;
    complaintsReviewed: number;
    complaintsApproved: number;
    complaintsDeclined: number;
    pendingInvestigations: number;
    reassignedCases: number;
    replacementApprovals: number;
    outstandingCases: number;
    avgVerificationMinutes: number | null;
  }>;
  complaintAnalytics: {
    totalComplaints: number;
    approvedCount: number;
    declinedCount: number;
    pendingVerificationCount: number;
    repeatedOrderComplaintsCount: number;
    avgInvestigationMinutes: number | null;
    byCategory: Array<{ category: string; count: number }>;
    byProduct: Array<{
      productOrService: string;
      count: number;
      approvedCount: number;
      isHighVolumeAnomaly: boolean;
    }>;
    byAgent: Array<{ agentName: string; count: number }>;
    bySupervisor: Array<{ supervisorName: string; reviewedCount: number; approvedCount: number; declinedCount: number }>;
  };
  inventoryAnalytics: {
    totalStock: number;
    availableStock: number;
    reservedStock: number;
    issuedStock: number;
    expiredStock: number;
    invalidStock: number;
    withdrawnStock: number;
    lowStockCategories: ReplacementInventoryCategoryRecord[];
    consumptionByProduct: Array<{ productOrService: string; issuedCount: number; reservedCount: number; availableCount: number }>;
    issuanceByAgent: Array<{ agentName: string; count: number }>;
    approvalsBySupervisor: Array<{ supervisorName: string; count: number }>;
  };
  backlogQueues: {
    unassignedConversations: number;
    conversationsAwaitingAgentResponse: number;
    ticketsAwaitingResolution: number;
    complaintsAwaitingSupervisorReview: number;
    complaintsAwaitingCustomerInfo: number;
    approvedComplaintsAwaitingReplacement: number;
    replacementsAwaitingDelivery: number;
    casesAwaitingSpecialisedPersonnel?: number;
    overdueCases24h: number;
    overdueCases48h: number;
    casesWithoutUpdates24h: number;
    reopenedCases: number;
    records: Array<{
      id: string;
      referenceCode: string;
      recordType: 'conversation' | 'complaint';
      customerName: string;
      subjectOrProduct: string;
      category?: string;
      department?: string;
      status: string;
      priority: string;
      assignedTo: string;
      assignedAgentName?: string;
      assignedSupervisorName?: string;
      assignedSpecialistName?: string;
      ageHours: number;
      hoursSinceLastUpdate: number;
      slaDeadlineAt?: string;
      slaCondition?: 'within_sla' | 'approaching_sla' | 'overdue_24h' | 'overdue_48h';
      waitingOn?: 'agent' | 'customer' | 'supervisor' | 'specialist';
      isOverdue24h: boolean;
      isOverdue48h: boolean;
      isUnassigned: boolean;
      isReopened: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
  };
}

export interface DailyClosingReportDto {
  generatedAt: string;
  reportPeriodLabel: string;
  fromIso: string;
  toIso: string;
  timezone: string;
  closingTime: string;
  organizationName: string;
  summary: {
    customersAttended: number;
    conversationsReceived: number;
    conversationsResolved: number;
    outstandingConversations: number;
    complaintsReceived: number;
    complaintsApproved: number;
    complaintsDeclined: number;
    pendingInvestigations: number;
    replacementsIssued: number;
    inventoryAdded: number;
    inventoryAdjusted: number;
    overdueCasesCount: number;
  };
  agentActivitySummary: Array<{
    agentName: string;
    role: string;
    conversationsHandled: number;
    conversationsResolved: number;
    complaintsSubmitted: number;
    replacementsDelivered: number;
    lastMeaningfulActionAt?: string | null;
  }>;
  supervisorActivitySummary: Array<{
    supervisorName: string;
    complaintsReviewed: number;
    complaintsApproved: number;
    complaintsDeclined: number;
    pendingInvestigations: number;
  }>;
  outstandingCases: Array<{
    referenceCode: string;
    type: 'conversation' | 'complaint';
    customerName: string;
    status: string;
    priority: string;
    assignedTo: string;
    ageHours: number;
  }>;
  observations: string[];
}
