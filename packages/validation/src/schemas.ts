import { z } from 'zod';
import {
  ConversationStatus,
  EscalationPriority,
  SupportChannel,
  UserRole,
} from '@careflow/shared';

export const SupportChannelSchema = z.nativeEnum(SupportChannel);
export const ConversationStatusSchema = z.nativeEnum(ConversationStatus);
export const EscalationPrioritySchema = z.nativeEnum(EscalationPriority);
export const UserRoleSchema = z.nativeEnum(UserRole);

export const CreateConversationRequestSchema = z.object({
  organizationSlug: z.string().min(2).max(64),
  channel: SupportChannelSchema,
  subject: z.string().min(3).max(160),
  customerEmail: z.string().email().optional(),
  customerExternalRef: z.string().max(128).optional(),
});

export const AppendMessageRequestSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  attachmentUrls: z.array(z.string().url()).max(5).default([]),
});

export const EscalationRequestSchema = z.object({
  conversationId: z.string().uuid(),
  priority: EscalationPrioritySchema.default(EscalationPriority.Normal),
  reason: z.string().min(5).max(500),
  diagnosticContext: z.record(z.string(), z.string()).default({}),
});

export const DeploymentEnquirySchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  workEmail: z.string().email('Enter a valid work email address'),
  organization: z.string().min(2, 'Organization name is required').max(100),
  primaryChannel: SupportChannelSchema,
  monthlyTicketVolume: z.enum(['under_1k', '1k_10k', '10k_50k', '50k_plus']),
  notes: z.string().max(1000).optional(),
});

export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export type AppendMessageRequest = z.infer<typeof AppendMessageRequestSchema>;
export type EscalationRequest = z.infer<typeof EscalationRequestSchema>;
export type DeploymentEnquiryInput = z.infer<typeof DeploymentEnquirySchema>;
