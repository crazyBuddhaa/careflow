export enum SupportChannel {
  WebWidget = 'web_widget',
  Telegram = 'telegram',
  Portal = 'portal',
  Email = 'email',
  WhatsApp = 'whatsapp',
  Api = 'api',
}

export enum ConversationStatus {
  Open = 'open',
  Pending = 'pending',
  Troubleshooting = 'troubleshooting',
  Escalated = 'escalated',
  Resolved = 'resolved',
  Closed = 'closed',
}

export enum EscalationPriority {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
  Urgent = 'urgent',
}

export enum UserRole {
  Customer = 'customer',
  Viewer = 'viewer',
  Agent = 'agent',
  Supervisor = 'supervisor',
  Admin = 'admin',
  Owner = 'owner',
}

export enum MessageSenderType {
  Customer = 'customer',
  System = 'system',
  Agent = 'agent',
  Bot = 'bot',
}

export type MessageDeliveryStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'internal';

export type ChannelIntegrationCategory =
  | 'telegram'
  | 'portal'
  | 'web_widget'
  | 'email'
  | 'whatsapp'
  | 'api_webhooks';

export type ChannelIntegrationLifecycleStatus =
  | 'not_activated'
  | 'setup_required'
  | 'pending_verification'
  | 'connected'
  | 'active'
  | 'attention_required'
  | 'disconnected';

export type BusinessOnboardingStatus =
  | 'incomplete'
  | 'in_progress'
  | 'ready_to_publish'
  | 'published'
  | 'suspended';

export type AccountRegistrationMode = 'business' | 'agent' | 'both';

export type AgentAccessMode = 'business_managed' | 'personal_account';

export type MembershipLifecycleStatus = 'active' | 'suspended' | 'revoked' | 'departed';

export type WorkspaceInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type WorkspacePermissionKey =
  | 'conversations:view'
  | 'conversations:reply'
  | 'conversations:assign'
  | 'customers:view'
  | 'knowledge:view'
  | 'knowledge:edit'
  | 'channels:manage'
  | 'team:invite'
  | 'team:manage'
  | 'settings:manage'
  | 'analytics:view'
  | 'claims:view'
  | 'claims:create'
  | 'claims:escalate'
  | 'claims:approve'
  | 'claims:fulfil_replacement'
  | 'inventory:view'
  | 'inventory:manage'
  | 'inventory:allocate'
  | 'operations:view'
  | 'reports:export'
  | 'audit:view';

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<UserRole, WorkspacePermissionKey[]> = {
  [UserRole.Owner]: [
    'conversations:view',
    'conversations:reply',
    'conversations:assign',
    'customers:view',
    'knowledge:view',
    'knowledge:edit',
    'channels:manage',
    'team:invite',
    'team:manage',
    'settings:manage',
    'analytics:view',
    'claims:view',
    'claims:create',
    'claims:escalate',
    'claims:approve',
    'claims:fulfil_replacement',
    'inventory:view',
    'inventory:manage',
    'inventory:allocate',
    'operations:view',
    'reports:export',
    'audit:view',
  ],
  [UserRole.Admin]: [
    'conversations:view',
    'conversations:reply',
    'conversations:assign',
    'customers:view',
    'knowledge:view',
    'knowledge:edit',
    'channels:manage',
    'team:invite',
    'team:manage',
    'settings:manage',
    'analytics:view',
    'claims:view',
    'claims:create',
    'claims:escalate',
    'claims:approve',
    'claims:fulfil_replacement',
    'inventory:view',
    'inventory:manage',
    'inventory:allocate',
    'operations:view',
    'reports:export',
    'audit:view',
  ],
  [UserRole.Supervisor]: [
    'conversations:view',
    'conversations:reply',
    'conversations:assign',
    'customers:view',
    'knowledge:view',
    'knowledge:edit',
    'analytics:view',
    'claims:view',
    'claims:create',
    'claims:escalate',
    'claims:approve',
    'claims:fulfil_replacement',
    'inventory:view',
    'inventory:allocate',
    'operations:view',
  ],
  [UserRole.Agent]: [
    'conversations:view',
    'conversations:reply',
    'customers:view',
    'knowledge:view',
    'claims:view',
    'claims:create',
    'claims:escalate',
    'claims:fulfil_replacement',
  ],
  [UserRole.Viewer]: [
    'conversations:view',
    'customers:view',
    'knowledge:view',
    'claims:view',
  ],
  [UserRole.Customer]: [],
};

export interface CareFlowUserRecord {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  mfaEnabled?: boolean;
  accountType?: AccountRegistrationMode;
  isPersonalAccount?: boolean;
  isPlatformAdmin?: boolean;
  createdAt: string;
}

export interface AgentIdentityRecord {
  id: string;
  email: string;
  displayName: string;
  userId?: string | null;
  emailVerified: boolean;
  department: string;
  specialty: string;
  accessMode: AgentAccessMode;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInvitationRecord {
  id: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  email: string;
  displayName?: string;
  role: UserRole.Admin | UserRole.Supervisor | UserRole.Agent | UserRole.Viewer;
  department: string;
  specialty?: string;
  permissions: WorkspacePermissionKey[];
  invitedByUserId?: string | null;
  invitedByName?: string;
  status: WorkspaceInvitationStatus;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  inviteUrl?: string;
  rawToken?: string;
}

export interface InvitationInspectionDto {
  invitation: WorkspaceInvitationRecord;
  organization: {
    id: string;
    name: string;
    slug: string;
    industry: string;
    country: string;
  };
  existingAgentIdentity?: {
    id: string;
    displayName: string;
    emailVerified: boolean;
    hasPersonalAccountLinked: boolean;
    activeWorkspaceCount: number;
  } | null;
  existingPersonalUser?: {
    id: string;
    fullName: string;
    emailVerified: boolean;
  } | null;
  canLinkToPersonalAccount: boolean;
  linkPromptMessage?: string;
}

export interface WorkspaceAuditLogRecord {
  id: string;
  organizationId?: string | null;
  organizationName?: string | null;
  actorUserId?: string | null;
  actorEmail?: string;
  actorName?: string;
  action?: string;
  actionType?: string;
  targetType?: string;
  targetId?: string | null;
  targetEmail?: string | null;
  targetUserId?: string | null;
  details?: string;
  metadataJson?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  organizationId: string;
  agentIdentityId?: string | null;
  accessMode?: AgentAccessMode;
  userAgent: string;
  ipAddress: string;
  mfaVerified: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  isCurrent?: boolean;
}

export interface AuthSecurityEventRecord {
  id: string;
  userId: string;
  organizationId?: string | null;
  eventType:
    | 'account_registered'
    | 'email_verification_requested'
    | 'email_verified'
    | 'login_succeeded'
    | 'login_failed'
    | 'login_mfa_challenged'
    | 'password_reset_requested'
    | 'password_reset_completed'
    | 'password_changed'
    | 'session_revoked'
    | 'all_sessions_revoked'
    | 'mfa_enrolled'
    | 'mfa_disabled'
    | 'invitation_created'
    | 'invitation_accepted'
    | 'invitation_revoked'
    | 'member_suspended'
    | 'member_reactivated'
    | 'member_revoked'
    | 'member_departed'
    | 'identity_linked';
  ipAddress: string;
  userAgent: string;
  metadataJson?: string;
  createdAt: string;
}

export interface MfaEnrollmentSetupDto {
  secret: string;
  otpauthUri: string;
  qrCodeSvgDataUrl: string;
  issuer: string;
  accountName: string;
}

export interface EmailDeliveryResult {
  sent: boolean;
  provider: 'resend' | 'unconfigured';
  fromAddress?: string;
  messageId?: string;
  errorMessage?: string;
  /**
   * Populated only in local development/test mode when Resend or a custom domain
   * is not configured, allowing end-to-end verification and password reset testing
   * on the Cloudflare Workers deployment URL without owning a custom domain.
   */
  devPreviewUrl?: string;
  devToken?: string;
}

export interface AccountSecurityOverviewDto {
  user: CareFlowUserRecord;
  mfaEnabled: boolean;
  mfaRequiredForRole: boolean;
  mfaEnforcementActive: boolean;
  recoveryCodesRemaining: number;
  activeSessions: AuthSessionRecord[];
  recentEvents: AuthSecurityEventRecord[];
  infrastructure: {
    resendConfigured: boolean;
    customSenderDomainConfigured: boolean;
    turnstileConfigured: boolean;
    appBaseUrl: string;
  };
}

export interface UserWorkspaceMembership {
  membershipId?: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: UserRole;
  status?: MembershipLifecycleStatus;
  membershipStatus?: MembershipLifecycleStatus;
  department?: string;
  permissions?: WorkspacePermissionKey[];
  accessMode?: AgentAccessMode;
  agentIdentityId?: string | null;
  country: string;
  industry: string;
  website?: string;
  onboardingStatus: BusinessOnboardingStatus;
  onboardingStep: number;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  country?: string;
  industry?: string;
  website?: string;
  onboardingStatus?: BusinessOnboardingStatus;
  onboardingStep?: number;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  organizationId: string;
  externalRef?: string;
  email?: string;
  displayName: string;
  preferredChannel: SupportChannel;
  createdAt: string;
}

export interface AgentProfile {
  id: string;
  organizationId: string;
  userId: string;
  displayName: string;
  role: UserRole.Agent | UserRole.Supervisor | UserRole.Admin;
  isAvailable: boolean;
  activeConversationCount: number;
}

export interface ConversationSummary {
  id: string;
  organizationId: string;
  customerId: string;
  assignedAgentId?: string;
  channel: SupportChannel;
  status: ConversationStatus;
  subject: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId?: string;
  body: string;
  attachmentUrls: string[];
  createdAt: string;
}

export interface KnowledgeArticleSummary {
  id: string;
  organizationId: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  published: boolean;
  updatedAt: string;
}

export interface TroubleshootingFlowNode {
  id: string;
  prompt: string;
  options: Array<{
    label: string;
    nextNodeId?: string;
    resolutionArticleSlug?: string;
    triggersEscalation?: boolean;
  }>;
}

export interface EscalationTicket {
  id: string;
  conversationId: string;
  priority: EscalationPriority;
  reason: string;
  diagnosticContext: Record<string, string>;
  createdAt: string;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
  meta?: {
    version: string;
    timestamp: string;
  };
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface HealthCheckReport {
  service: string;
  version: string;
  status: 'operational' | 'degraded';
  timestamp: string;
  database?: {
    connected: boolean;
    engine: 'd1-sqlite';
    latencyMs: number;
    errorMessage?: string;
  };
  security?: {
    sessionSecretConfigured: boolean;
    turnstileConfigured: boolean;
    resendConfigured: boolean;
  };
}

