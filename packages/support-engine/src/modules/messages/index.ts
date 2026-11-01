import type { ConversationMessage, MessageSenderType } from '@careflow/shared';

export interface RecordMessageCommand {
  conversationId: string;
  senderType: MessageSenderType;
  senderId?: string;
  body: string;
  attachmentUrls?: string[];
}

export interface MessageRepositoryPort {
  append(command: RecordMessageCommand): Promise<ConversationMessage>;
  listByConversation(
    conversationId: string,
    options?: { limit?: number; beforeTimestamp?: string }
  ): Promise<ConversationMessage[]>;
}
