import type {
  ConversationStatus,
  ConversationSummary,
  SupportChannel,
} from '@careflow/shared';

export interface OpenConversationCommand {
  organizationId: string;
  customerId: string;
  channel: SupportChannel;
  subject: string;
}

export interface ConversationRepositoryPort {
  create(command: OpenConversationCommand): Promise<ConversationSummary>;
  findById(organizationId: string, conversationId: string): Promise<ConversationSummary | null>;
  updateStatus(
    organizationId: string,
    conversationId: string,
    status: ConversationStatus
  ): Promise<ConversationSummary>;
}

/**
 * Channel-agnostic conversation intake contract shared by Website Widget and Telegram adapters.
 */
export interface ChannelConversationGatewayPort {
  ingestChannelConversation(command: OpenConversationCommand): Promise<ConversationSummary>;
}
