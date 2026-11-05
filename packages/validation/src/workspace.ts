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
      logoUrl: z.string().trim().max(600000).optional(),
      primaryColor: z.string().trim().max(30).optional(),
      secondaryColor: z.string().trim().max(30).optional(),
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
  isInternalNote: z.boolean().optional().default(false),
  nextStatus: z.nativeEnum(ConversationStatus).optional(),
});

export const UpdateConversationStatusSchema = z.object({
  status: z.nativeEnum(ConversationStatus).optional(),
  priority: z.nativeEnum(EscalationPriority).optional(),
  category: z.string().trim().min(2).max(100).optional(),
  assignedAgentName: z.string().trim().max(100).nullable().optional(),
  assignedAgentId: z.string().trim().max(100).nullable().optional(),
});

export const ChannelIntegrationCategorySchema = z.enum([
  'telegram',
  'portal',
  'web_widget',
  'email',
  'whatsapp',
  'api_webhooks',
]);

export const ConfigureChannelIntegrationSchema = z.object({
  channel: ChannelIntegrationCategorySchema,
  action: z.enum([
    'activate',
    'deactivate',
    'rotate_token',
    'update_config',
    'connect_subbot',
    'disconnect_subbot',
  ]),
  customBotToken: z.string().trim().min(15).max(200).optional(),
  telegramConfig: z
    .object({
      welcomeMessage: z.string().trim().min(4).max(500).optional(),
      supportCategories: z.array(z.string().trim().min(2).max(80)).min(1).max(15).optional(),
      allowHumanEscalation: z.boolean().optional(),
      escalationPriorityDefault: z.nativeEnum(EscalationPriority).optional(),
      notifyAssignedAgentOnTelegram: z.boolean().optional(),
      offlineMessage: z.string().trim().min(4).max(400).optional(),
    })
    .optional(),
  widgetConfig: z
    .object({
      launcherTitle: z.string().trim().min(2).max(80).optional(),
      welcomeGreeting: z.string().trim().min(4).max(300).optional(),
      primaryColor: z.string().trim().min(4).max(24).optional(),
      position: z.enum(['bottom-right', 'bottom-left']).optional(),
      allowedOrigins: z.array(z.string().trim().max(180)).max(15).optional(),
      allowHumanEscalation: z.boolean().optional(),
    })
    .optional(),
  emailConfig: z
    .object({
      forwardingAddress: z.string().trim().email().max(160).optional(),
      outboundReplyFromName: z.string().trim().min(2).max(100).optional(),
      autoAcknowledgeEnabled: z.boolean().optional(),
    })
    .optional(),
});

export const SavedReplyInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80).default('General'),
  body: z.string().trim().min(4).max(2000),
  shortcut: z.string().trim().max(40).optional().default(''),
});

export const PublicWidgetMessageSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  sessionRef: z.string().trim().min(4).max(120).optional(),
  customerName: z.string().trim().max(100).optional(),
  customerEmail: z.string().trim().email().max(160).optional(),
  category: z.string().trim().max(100).optional(),
  escalateToHuman: z.boolean().optional().default(false),
  idempotencyKey: z.string().trim().max(120).optional(),
});

export const WorkspacePermissionKeySchema = z.enum([
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
]);

export const CreateAgentSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  role: z.enum([UserRole.Agent, UserRole.Supervisor, UserRole.Admin]),
  department: z.string().trim().max(100).optional().default(''),
  specialty: z.string().trim().min(2).max(120),
  availability: z.enum(['available', 'busy', 'offline']).default('available'),
  permissions: z.array(WorkspacePermissionKeySchema).max(20).optional(),
});

export const UpdateAgentSchema = z.object({
  role: z.enum([UserRole.Agent, UserRole.Supervisor, UserRole.Admin]).optional(),
  department: z.string().trim().max(100).optional(),
  specialty: z.string().trim().min(2).max(120).optional(),
  availability: z.enum(['available', 'busy', 'offline']).optional(),
  permissions: z.array(WorkspacePermissionKeySchema).max(20).optional(),
  lifecycleAction: z.enum(['suspend', 'reactivate', 'revoke']).optional(),
});

export const CreateWorkspaceInvitationSchema = z.object({
  email: z.string().trim().email('Please provide a valid agent email address.').max(160),
  role: z.enum([UserRole.Admin, UserRole.Supervisor, UserRole.Agent, UserRole.Viewer]),
  department: z.string().trim().max(100).optional().default(''),
  permissions: z.array(WorkspacePermissionKeySchema).max(20).optional(),
  expiresInHours: z.number().int().min(1).max(168).optional().default(72),
});

export const AcceptWorkspaceInvitationSchema = z.object({
  displayName: z.string().trim().min(2, 'Please enter your display name.').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128).optional(),
  accessMode: z.enum(['business_managed', 'personal_account']).default('business_managed'),
  consentToLinkPersonalAccount: z.boolean().optional().default(false),
});

export const StrongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  .max(128, 'Password must not exceed 128 characters.')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
  .regex(
    /^(?=.*[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
    'Password must contain at least one number or special character.'
  );

export const LinkAgentIdentitySchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    password: StrongPasswordSchema.optional(),
    confirmPassword: z.string().optional(),
    consentConfirmed: z
      .boolean()
      .refine((v) => v === true, 'Explicit consent is required to link your agent identity to a personal CustomCare account.'),
  })
  .refine(
    (data) => !data.password || data.password === data.confirmPassword,
    {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    }
  );

export const LeaveWorkspaceSchema = z.object({
  organizationId: z.string().trim().min(2).max(100),
  confirmLeave: z.boolean().refine((v) => v === true, 'Please confirm that you want to leave this workspace.'),
});

export const CreateDemoConversationSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().trim().email().max(160),
  channel: z.nativeEnum(SupportChannel).default(SupportChannel.Portal),
  category: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(4).max(1500),
});

export const BusinessCategoryEnum = z.enum([
  'E-commerce and retail',
  'Financial services',
  'Technology',
  'Education',
  'Healthcare',
  'Hospitality',
  'Professional services',
  'Logistics and transportation',
  'Other',
]);

export const RegisterUserAccountSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(100),
    email: z.string().trim().email('Please provide a valid email address.').max(160),
    password: StrongPasswordSchema,
    confirmPassword: z.string(),
    agreeToTerms: z
      .boolean()
      .refine((val) => val === true, 'You must accept the Terms of Service and Privacy Policy.'),
    turnstileToken: z.string().trim().max(2048).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const RegisterInitialBusinessSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(90),
  industry: z.string().trim().min(2, 'Please select or enter an industry.').max(60),
  country: z.string().trim().min(2, 'Please select a country of operation.').max(80),
  website: z.string().trim().max(180).optional().default(''),
});

export const FullRegistrationSchema = z
  .object({
    registrationRole: z.enum(['business', 'agent']).optional().default('business'),
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(100),
    email: z.string().trim().email('Please provide a valid email address.').max(160),
    password: StrongPasswordSchema,
    confirmPassword: z.string(),
    agreeToTerms: z
      .boolean()
      .refine((val) => val === true, 'You must accept the Terms of Service and Privacy Policy.'),
    businessName: z.string().trim().max(90).optional().default(''),
    industry: z.string().trim().max(60).optional().default('Technology'),
    country: z.string().trim().max(80).optional().default('United States'),
    website: z.string().trim().max(180).optional().default(''),
    specialty: z.string().trim().max(120).optional().default('Customer Support'),
    department: z.string().trim().max(100).optional().default('Support Operations'),
    invitationToken: z.string().trim().max(256).optional(),
    turnstileToken: z.string().trim().max(2048).optional(),
    redirectTo: z.string().trim().max(300).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine(
    (data) =>
      data.registrationRole === 'agent' ||
      (data.businessName.trim().length >= 2 &&
        data.industry.trim().length >= 2 &&
        data.country.trim().length >= 2),
    {
      message: 'Business name, industry, and country are required when registering a business.',
      path: ['businessName'],
    }
  );

export const UserLoginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email.').max(160),
  password: z.string().min(1, 'Please enter your password.').max(128),
  mfaCode: z.string().trim().max(32).optional(),
  turnstileToken: z.string().trim().max(2048).optional(),
  redirectTo: z.string().trim().max(300).optional(),
});

export const VerifyEmailTokenSchema = z.object({
  token: z.string().trim().min(16, 'Invalid verification token.').max(256),
});

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(160),
  turnstileToken: z.string().trim().max(2048).optional(),
});

export const ConfirmPasswordResetSchema = z
  .object({
    token: z.string().trim().min(16, 'Invalid password reset token.').max(256),
    newPassword: StrongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.').max(128),
    newPassword: StrongPasswordSchema,
    confirmPassword: z.string(),
    revokeOtherSessions: z.boolean().optional().default(true),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from your current password.',
    path: ['newPassword'],
  });

export const RevokeSessionSchema = z.object({
  sessionId: z.string().trim().min(4).max(120).optional(),
  revokeAllOther: z.boolean().optional().default(false),
  revokeAllIncludingCurrent: z.boolean().optional().default(false),
});

export const MfaVerifyEnrollmentSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
});

export const MfaLoginChallengeSchema = z.object({
  challengeToken: z.string().trim().min(16).max(512),
  code: z.string().trim().min(6, 'Enter your 6-digit authenticator code or recovery code.').max(32),
  redirectTo: z.string().trim().max(300).optional(),
});

export const MfaDisableSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required to disable MFA.').max(128),
  code: z.string().trim().min(6, 'Enter a valid 6-digit authenticator code or recovery code.').max(32),
});

/**
 * Validates and sanitizes a redirect target to prevent open-redirect vulnerabilities.
 * Allows safe internal paths starting with a single `/` (and not `//` or `/\`)
 * or URLs matching an explicitly configured allowlist of origins.
 */
export function validateSafeRedirectUrl(
  rawUrl: string | undefined | null,
  allowedOrigins: string[] = [],
  fallback = '/admin'
): { valid: boolean; sanitizedUrl: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: true, sanitizedUrl: fallback };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: true, sanitizedUrl: fallback };
  }

  // Block dangerous schemes or control characters
  if (/[\r\n\0]/.test(trimmed) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, sanitizedUrl: fallback };
      }
      const normalizedAllowed = allowedOrigins
        .map((o) => o.trim().replace(/\/+$/, '').toLowerCase())
        .filter(Boolean);
      if (normalizedAllowed.includes(parsed.origin.toLowerCase())) {
        return { valid: true, sanitizedUrl: parsed.toString() };
      }
      return { valid: false, sanitizedUrl: fallback };
    } catch {
      return { valid: false, sanitizedUrl: fallback };
    }
  }

  // Relative path must begin with a single `/` and never `//` or `/\`
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return { valid: true, sanitizedUrl: trimmed };
  }

  return { valid: false, sanitizedUrl: fallback };
}

export const SwitchWorkspaceSchema = z.object({
  organizationId: z.string().trim().min(2).max(100),
});

export const CreateAdditionalBusinessSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(90),
  industry: z.string().trim().min(2, 'Please select or enter an industry.').max(60),
  country: z.string().trim().min(2, 'Please select a country of operation.').max(80),
  website: z.string().trim().max(180).optional().default(''),
});

export const SaveOnboardingStepSchema = z.object({
  step: z.number().int().min(1).max(7),
  profile: z
    .object({
      description: z.string().trim().min(10).max(600).optional(),
      contactEmail: z.string().trim().email().max(160).optional(),
      country: z.string().trim().min(2).max(80).optional(),
      industry: z.string().trim().min(2).max(60).optional(),
      website: z.string().trim().max(180).optional(),
      phoneNumber: z.string().trim().max(40).optional(),
      address: z.string().trim().max(200).optional(),
      socialLinks: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  branding: z
    .object({
      displayName: z.string().trim().min(2).max(100).optional(),
      logoText: z.string().trim().min(2).max(120).optional(),
      logoUrl: z.string().trim().max(600000).optional(),
      accentTheme: PortalAccentThemeSchema.optional(),
      primaryColor: z.string().trim().max(30).optional(),
      secondaryColor: z.string().trim().max(30).optional(),
      welcomeMessage: z.string().trim().min(4).max(300).optional(),
    })
    .optional(),
  supportConfig: z
    .object({
      supportedProducts: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      handledIssues: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
      supportedTopics: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      restrictedTopics: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
      languages: z.array(z.string().trim().min(2).max(50)).max(10).optional(),
      communicationStyle: CommunicationStyleSchema.optional(),
    })
    .optional(),
  humanSupport: z
    .object({
      contactInfo: z.string().trim().max(200).optional(),
      operatingHours: z.string().trim().max(160).optional(),
      timezone: z.string().trim().max(60).optional(),
      escalationConditions: z.string().trim().max(400).optional(),
      humanSupportAvailable: z.boolean().optional(),
    })
    .optional(),
  chatbot: z
    .object({
      assistantName: z.string().trim().min(2).max(80).optional(),
      greetingMessage: z.string().trim().min(4).max(300).optional(),
      communicationStyle: CommunicationStyleSchema.optional(),
      supportedLanguages: z.array(z.string().trim().min(2).max(50)).max(10).optional(),
      approvedTopics: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
      restrictedTopics: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
      escalationRules: z.string().trim().max(400).optional(),
      aiProviderConfigured: z.boolean().optional(),
    })
    .optional(),
});
