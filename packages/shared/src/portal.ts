import {
  ConversationStatus,
  EscalationPriority,
  MessageSenderType,
  SupportChannel,
  UserRole,
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

export interface WorkspaceMessageItem {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface WorkspaceConversationItem {
  id: string;
  organizationId: string;
  customerName: string;
  customerEmail: string;
  customerExternalRef: string;
  channel: SupportChannel;
  status: ConversationStatus;
  priority: EscalationPriority;
  category: string;
  subject: string;
  assignedAgentName: string | null;
  diagnosticSummary: string;
  createdAt: string;
  updatedAt: string;
  messages: WorkspaceMessageItem[];
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
  displayName: string;
  email: string;
  role: UserRole.Agent | UserRole.Supervisor | UserRole.Admin;
  specialty: string;
  availability: AgentAvailability;
  activeConversations: number;
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
  | 'analytics';
