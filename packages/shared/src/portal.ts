export type PortalIconKey = 'wallet' | 'compass' | 'user-check' | 'help-circle';

export type PortalAccentTheme = 'blue-teal' | 'teal-slate' | 'indigo-sky';

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
}

export interface PortalKnowledgePreviewItem {
  slug: string;
  title: string;
  category: string;
  summary: string;
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
  communicationStyle: 'professional-concise' | 'warm-helpful' | 'technical-precise';
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
  branding: PortalBrandingConfig;
  welcomeHeadline: string;
  welcomeDescription: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  categories: PortalCategoryConfig[];
  publishedKnowledge: PortalKnowledgePreviewItem[];
  faqs: PortalFaqItem[];
  chatbot: PortalChatbotConfig;
  escalation: PortalEscalationSettings;
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
