import {
  ConversationStatus,
  EscalationPriority,
  MessageSenderType,
  SupportChannel,
  UserRole,
  type BusinessOnboardingStatus,
  type ChannelIntegrationCategory,
  type ChannelIntegrationLifecycleStatus,
  type MessageDeliveryStatus,
} from './types';

export type PortalIconKey = 'wallet' | 'compass' | 'user-check' | 'help-circle';

export type PortalAccentTheme = 'blue-teal' | 'teal-slate' | 'indigo-sky';

export type CommunicationStyle =
  | 'professional-concise'
  | 'warm-helpful'
  | 'technical-precise';

export type ResponsePriorityLayer =
  | 'business-rules'
  | 'knowledge-base'
  | 'guided-troubleshooting'
  | 'ai-fallback'
  | 'human-escalation';

export type ExternalAiProviderKey = 'gemini' | 'groq' | 'openrouter';

export interface ExternalAiFallbackSettings {
  enabled: boolean;
  provider: ExternalAiProviderKey;
  confidenceThreshold: number;
  dailyRequestCap: number;
  systemInstructions: string;
}

export interface SupportProcedureStep {
  stepNumber: number;
  instruction: string;
  expectedOutcome: string;
}

export interface SupportProcedureItem {
  id: string;
  title: string;
  category: string;
  triggerPhrases: string[];
  steps: SupportProcedureStep[];
  escalationRule: string;
  isPublished: boolean;
}

export interface PortalBrandingConfig {
  displayName: string;
  logoText: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentTheme: PortalAccentTheme;
  portalSubtitle: string;
}

export interface PortalCategoryConfig {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  customerPrompt: string;
  targetNodeId: string;
  iconKey: PortalIconKey;
}

export interface PortalFaqItem {
  id: string;
  question: string;
  answer: string;
  categoryId: string;
  categoryName?: string;
}

export interface PortalKnowledgePreviewItem {
  id?: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  content?: string;
  tags?: string[];
  updatedAt?: string;
}

export interface PortalGuidedOption {
  id: string;
  label: string;
  nextNodeId: string;
}

export interface PortalGuidedNode {
  id: string;
  reply: string;
  options: PortalGuidedOption[];
  isCompleted?: boolean;
}

export interface PortalChatbotConfig {
  assistantName: string;
  assistantSubtitle: string;
  initialGreeting: string;
  supportedTopics: string[];
  restrictedTopics: string[];
  communicationStyle: CommunicationStyle;
  responsePriority?: ResponsePriorityLayer[];
  aiFallback?: ExternalAiFallbackSettings;
  nodes: Record<string, PortalGuidedNode>;
}

export interface PortalEscalationSettings {
  sectionEyebrow: string;
  headline: string;
  description: string;
  ctaLabel: string;
  customerTriggerPrompt: string;
  targetNodeId: string;
  supportInstructions: string;
}

export interface BusinessPortalConfig {
  organizationId: string;
  slug: string;
  onboardingStatus?: BusinessOnboardingStatus;
  verifiedHostnames: string[];
  contactEmail?: string;
  supportHours?: string;
  branding: PortalBrandingConfig;
  welcomeHeadline: string;
  welcomeDescription: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  categories: PortalCategoryConfig[];
  publishedKnowledge: PortalKnowledgePreviewItem[];
  faqs: PortalFaqItem[];
  procedures?: SupportProcedureItem[];
  chatbot: PortalChatbotConfig;
  escalation: PortalEscalationSettings;
}

export interface PublicPortalSummary {
  organizationId: string;
  slug: string;
  displayName: string;
  portalSubtitle: string;
  welcomeHeadline: string;
  accentTheme: PortalAccentTheme;
  verifiedHostname: string;
  publishedArticleCount: number;
  publishedFaqCount: number;
}

export interface ConversationAttachmentRecord {
  id: string;
  organizationId: string;
  conversationId: string;
  messageId?: string | null;
  channel: SupportChannel;
  fileName: string;
  mimeType: string;
  fileSize: number;
  externalFileId?: string | null;
  createdAt: string;
}

export type TelegramCustomerFlowStep =
  | 'main_menu'
  | 'payment_menu'
  | 'payment_awaiting_details'
  | 'product_select'
  | 'product_issue'
  | 'technical_menu'
  | 'technical_awaiting_details'
  | 'other_enquiry'
  | 'conversation_select';

export interface TelegramCustomerSessionState {
  step: TelegramCustomerFlowStep;
  selectedCategory?: string;
  selectedSubIssue?: string;
  selectedProduct?: string;
  pendingTransactionRef?: string;
  pendingPaymentAmountDate?: string;
  updatedAt: string;
}

export interface WorkspaceMessageItem {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderName: string;
  senderUserId?: string | null;
  body: string;
  isInternalNote?: boolean;
  externalMessageId?: string | null;
  deliveryStatus?: MessageDeliveryStatus;
  deliveryError?: string | null;
  attachments?: ConversationAttachmentRecord[];
  createdAt: string;
}

export interface ConversationActivityLogItem {
  id: string;
  conversationId: string;
  organizationId: string;
  actorUserId?: string | null;
  actorName: string;
  actorType: 'customer' | 'agent' | 'system' | 'bot';
  actionType:
    | 'conversation_created'
    | 'assigned'
    | 'transferred'
    | 'status_changed'
    | 'priority_changed'
    | 'escalated'
    | 'internal_note_added'
    | 'reopened';
  details: string;
  createdAt: string;
}

export interface WorkspaceConversationItem {
  id: string;
  organizationId: string;
  customerName: string;
  customerEmail: string;
  customerExternalRef: string;
  customerIdentityId?: string | null;
  sourceChannelRef?: string;
  channel: SupportChannel;
  status: ConversationStatus;
  priority: EscalationPriority;
  category: string;
  subject: string;
  assignedAgentId?: string | null;
  assignedAgentName: string | null;
  diagnosticSummary: string;
  escalationCount?: number;
  createdAt: string;
  updatedAt: string;
  messages: WorkspaceMessageItem[];
  activityLogs?: ConversationActivityLogItem[];
}

export interface SavedReplyRecord {
  id: string;
  organizationId: string;
  title: string;
  category: string;
  body: string;
  shortcut?: string;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramChannelConfig {
  welcomeMessage: string;
  supportCategories: string[];
  allowHumanEscalation: boolean;
  escalationPriorityDefault: EscalationPriority;
  notifyAssignedAgentOnTelegram: boolean;
  offlineMessage: string;
}

export interface WebWidgetChannelConfig {
  launcherTitle: string;
  welcomeGreeting: string;
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  allowedOrigins: string[];
  allowHumanEscalation: boolean;
}

export interface EmailChannelConfig {
  forwardingAddress: string;
  outboundReplyFromName: string;
  inboundWebhookVerified: boolean;
  autoAcknowledgeEnabled: boolean;
}

export interface ChannelIntegrationRecord {
  id: string;
  organizationId: string;
  channel: ChannelIntegrationCategory;
  status: ChannelIntegrationLifecycleStatus;
  isSupportedNow: boolean;
  availabilityLabel: 'Available' | 'Beta' | 'Planned';
  publicToken?: string | null;
  deepLinkUrl?: string | null;
  qrCodeSvgDataUrl?: string | null;
  widgetEmbedScript?: string | null;
  centralBotUsername: string;
  telegramConfig?: TelegramChannelConfig;
  widgetConfig?: WebWidgetChannelConfig;
  emailConfig?: EmailChannelConfig;
  lastEventAt?: string | null;
  lastErrorMessage?: string | null;
  activatedAt?: string | null;
  updatedAt: string;
}

export interface TelegramAgentLinkRecord {
  id: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  organizationId: string;
  organizationName: string;
  role: UserRole;
  status: 'pending_code' | 'linked' | 'revoked';
  telegramUserId?: string | null;
  telegramChatId?: string | null;
  telegramUsername?: string | null;
  activeOrganizationId?: string | null;
  activeConversationId?: string | null;
  notificationsEnabled: boolean;
  codeExpiresAt?: string | null;
  linkedAt?: string | null;
  updatedAt: string;
}

export interface TelegramAgentLinkCodeResponse {
  linkingCode: string;
  expiresAt: string;
  centralBotUsername: string;
  deepLinkUrl: string;
  instructions: string[];
}

export interface WorkspaceCustomerRecord {
  id: string;
  organizationId: string;
  displayName: string;
  email: string;
  externalRef: string;
  preferredChannel: SupportChannel;
  totalConversations: number;
  openConversations: number;
  lastInteractionAt: string;
}

export type AgentAvailability = 'available' | 'busy' | 'offline';

export interface WorkspaceAgentRecord {
  id: string;
  organizationId: string;
  userId?: string | null;
  displayName: string;
  email: string;
  role: UserRole.Agent | UserRole.Supervisor | UserRole.Admin;
  specialty: string;
  availability: AgentAvailability;
  activeConversations: number;
  telegramLinked?: boolean;
  telegramUsername?: string | null;
  createdAt: string;
}

export interface WorkspaceAnalyticsSummary {
  organizationId: string;
  knowledge: {
    totalArticles: number;
    publishedArticles: number;
    draftArticles: number;
    totalFaqs: number;
    publishedFaqs: number;
    totalCategories: number;
    publishedProcedures: number;
  };
  conversations: {
    total: number;
    open: number;
    pending?: number;
    troubleshooting: number;
    escalated: number;
    resolved: number;
  };
  channels: Array<{
    channel: SupportChannel;
    count: number;
  }>;
  topCategories: Array<{
    category: string;
    count: number;
  }>;
  team: {
    totalSpecialists: number;
    availableSpecialists: number;
  };
}

export interface PortalAssistantResponseDto {
  reply: string;
  resolutionLayer: ResponsePriorityLayer | 'boundary-guard';
  matchedSourceTitle?: string;
  matchedArticleSlug?: string;
  suggestEscalation: boolean;
  suggestedTopic?: string;
}

export type AdminModuleSectionKey =
  | 'onboarding-guide'
  | 'integrations'
  | 'business-profile'
  | 'branding'
  | 'knowledge-overview'
  | 'knowledge-articles'
  | 'faqs'
  | 'categories'
  | 'chatbot-settings'
  | 'support-procedures'
  | 'agents'
  | 'conversations'
  | 'customers'
  | 'analytics'
  | 'account-security';

export interface OnboardingStepItemStatus {
  step: number;
  id: string;
  title: string;
  description: string;
  completed: boolean;
  isOptional: boolean;
  summary: string;
}

export interface OnboardingProgressReport {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  country?: string;
  industry?: string;
  website?: string;
  status: 'incomplete' | 'in_progress' | 'ready_to_publish' | 'published' | 'suspended';
  currentStep: number;
  completedStepsCount: number;
  totalStepsCount: number;
  completionPercentage: number;
  canPublish: boolean;
  missingRequirements: string[];
  steps: OnboardingStepItemStatus[];
  lastSavedAt: string;
}
