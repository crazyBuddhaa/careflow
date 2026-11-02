import { z } from 'zod';
import {
  ConversationStatus,
  EscalationPriority,
  SupportChannel,
  UserRole,
} from '@careflow/shared';

export const PortalAccentThemeSchema = z.enum(['blue-teal', 'teal-slate', 'indigo-sky']);

export const CommunicationStyleSchema = z.enum([
  'professional-concise',
  'warm-helpful',
  'technical-precise',
]);

export const ResponsePriorityLayerSchema = z.enum([
  'business-rules',
  'knowledge-base',
  'guided-troubleshooting',
  'ai-fallback',
  'human-escalation',
]);

export const ExternalAiProviderSchema = z.enum(['gemini', 'groq', 'openrouter']);

export const SupportProcedureStepSchema = z.object({
  stepNumber: z.number().int().min(1).max(20),
  instruction: z.string().trim().min(3).max(500),
  expectedOutcome: z.string().trim().min(2).max(300),
});

export const SupportProcedureItemSchema = z.object({
  id: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(160),
  category: z.string().trim().min(2).max(100),
  triggerPhrases: z.array(z.string().trim().min(1).max(80)).max(15),
  steps: z.array(SupportProcedureStepSchema).min(1).max(12),
  escalationRule: z.string().trim().min(3).max(400),
  isPublished: z.boolean(),
});

export const UpdateWorkspaceSettingsSchema = z.object({
  contactEmail: z.string().trim().email().max(160).optional(),
  supportHours: z.string().trim().min(2).max(160).optional(),
  verifiedHostnames: z
    .array(z.string().trim().min(3).max(180))
    .min(1)
    .max(10)
    .optional(),
  branding: z
    .object({
      displayName: z.string().trim().min(2).max(100),
      logoText: z.string().trim().min(2).max(120),
      accentTheme: PortalAccentThemeSchema,
      portalSubtitle: z.string().trim().min(2).max(160),
    })
    .optional(),
  welcomeHeadline: z.string().trim().min(4).max(180).optional(),
  welcomeDescription: z.string().trim().min(10).max(500).optional(),
  primaryCtaLabel: z.string().trim().min(2).max(60).optional(),
  secondaryCtaLabel: z.string().trim().min(2).max(60).optional(),
  chatbot: z
    .object({
      assistantName: z.string().trim().min(2).max(80),
      assistantSubtitle: z.string().trim().min(2).max(140),
      initialGreeting: z.string().trim().min(4).max(400),
      supportedTopics: z.array(z.string().trim().min(2).max(100)).min(1).max(25),
      restrictedTopics: z.array(z.string().trim().min(2).max(120)).max(25),
      communicationStyle: CommunicationStyleSchema,
      responsePriority: z.array(ResponsePriorityLayerSchema).min(1).max(5).optional(),
      aiFallback: z
        .object({
          enabled: z.boolean(),
          provider: ExternalAiProviderSchema,
          confidenceThreshold: z.number().min(0.1).max(0.99),
          dailyRequestCap: z.number().int().min(0).max(100000),
          systemInstructions: z.string().trim().max(1200),
        })
        .optional(),
    })
    .optional(),
  escalation: z
    .object({
      sectionEyebrow: z.string().trim().min(2).max(80),
      headline: z.string().trim().min(4).max(160),
      description: z.string().trim().min(8).max(400),
      ctaLabel: z.string().trim().min(2).max(60),
      supportInstructions: z.string().trim().min(4).max(600),
    })
    .optional(),
  procedures: z.array(SupportProcedureItemSchema).max(30).optional(),
});

export const CreateOnboardingWorkspaceSchema = z.object({
  businessName: z.string().trim().min(2).max(90),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Portal slug must contain only lowercase letters, numbers, and hyphens.'
    )
    .min(2)
    .max(48),
  contactEmail: z.string().trim().email().max(160),
  accentTheme: PortalAccentThemeSchema.default('blue-teal'),
  welcomeHeadline: z.string().trim().min(6).max(160),
  welcomeDescription: z.string().trim().min(12).max(420),
  initialGreeting: z.string().trim().min(6).max(320),
  supportedTopics: z.array(z.string().trim().min(2).max(80)).min(1).max(12),
  restrictedTopics: z.array(z.string().trim().min(2).max(100)).max(12).default([]),
  communicationStyle: CommunicationStyleSchema.default('warm-helpful'),
});

export const PortalAssistantQuerySchema = z.object({
  message: z.string().trim().min(2).max(600),
});

export const CreatePortalEscalationSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().trim().email().max(160),
  customerExternalRef: z.string().trim().max(100).optional().default(''),
  category: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(6).max(1500),
  priority: z
    .nativeEnum(EscalationPriority)
    .optional()
    .default(EscalationPriority.Normal),
  transcriptSummary: z.string().trim().max(2500).optional().default(''),
});

export const ReplyConversationSchema = z.object({
  senderName: z.string().trim().min(2).max(100).optional(),
  body: z.string().trim().min(2).max(2000),
  nextStatus: z.nativeEnum(ConversationStatus).optional(),
});

export const UpdateConversationStatusSchema = z.object({
  status: z.nativeEnum(ConversationStatus),
  assignedAgentName: z.string().trim().max(100).nullable().optional(),
});

export const CreateAgentSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  role: z.enum([UserRole.Agent, UserRole.Supervisor, UserRole.Admin]),
  specialty: z.string().trim().min(2).max(120),
  availability: z.enum(['available', 'busy', 'offline']).default('available'),
});

export const UpdateAgentSchema = z.object({
  role: z.enum([UserRole.Agent, UserRole.Supervisor, UserRole.Admin]).optional(),
  specialty: z.string().trim().min(2).max(120).optional(),
  availability: z.enum(['available', 'busy', 'offline']).optional(),
});

export const CreateDemoConversationSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().trim().email().max(160),
  channel: z.nativeEnum(SupportChannel).default(SupportChannel.Portal),
  category: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(4).max(1500),
});
