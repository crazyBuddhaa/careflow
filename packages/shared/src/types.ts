export enum SupportChannel {
  WebWidget = 'web_widget',
  Telegram = 'telegram',
  Portal = 'portal',
}

export enum ConversationStatus {
  Open = 'open',
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
  Agent = 'agent',
  Supervisor = 'supervisor',
  Admin = 'admin',
}

export enum MessageSenderType {
  Customer = 'customer',
  System = 'system',
  Agent = 'agent',
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
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
  client: string;
  status: 'operational' | 'degraded';
  environment: string;
  architecture: {
    hosting: 'vercel-ready';
    backend: 'nextjs-route-handlers';
    database: 'supabase-postgresql';
    realtime: 'supabase-realtime-prepared';
    channels: SupportChannel[];
  };
  supabase: {
    publicClientConfigured: boolean;
    serverRoleConfigured: boolean;
  };
  modules: Array<{
    key: string;
    name: string;
    stage: 'scaffolded' | 'ready';
  }>;
  timestamp: string;
}
