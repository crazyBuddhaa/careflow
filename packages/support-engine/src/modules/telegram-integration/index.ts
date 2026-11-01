import { SupportChannel } from '@careflow/shared';

export interface NormalizedInboundChannelEnvelope {
  channel: SupportChannel.Telegram | SupportChannel.WebWidget;
  externalChatId: string;
  externalSenderId: string;
  senderDisplayName: string;
  text: string;
  receivedAt: string;
}

/**
 * Structural adapter interface for Telegram integration.
 * Ensures Telegram webhooks normalize payloads into the shared conversation infrastructure
 * used by the Website Widget. Bot runtime is intentionally deferred per v0.1.0 scope.
 */
export interface TelegramChannelAdapterPort {
  verifyWebhookSignature(secretHeader: string | null): boolean;
  normalizeUpdatePayload(rawUpdate: unknown): NormalizedInboundChannelEnvelope | null;
}
