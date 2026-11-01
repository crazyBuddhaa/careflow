export interface RealtimeChannelEvent<TPayload = unknown> {
  topic: string;
  event: 'conversation.updated' | 'message.created' | 'escalation.triggered' | 'agent.assigned';
  payload: TPayload;
  emittedAt: string;
}

export interface RealtimePublisherPort {
  publish<TPayload>(channelEvent: RealtimeChannelEvent<TPayload>): Promise<void>;
}

export interface RealtimeSubscriptionHandle {
  unsubscribe(): Promise<void>;
}

/**
 * Structural adapter contract for Supabase Realtime topics.
 * Decouples conversation and agent notification logic from direct WebSocket transport details.
 */
export function buildConversationRealtimeTopic(organizationId: string, conversationId: string): string {
  return `org:${organizationId}:conversation:${conversationId}`;
}

export function buildAgentQueueRealtimeTopic(organizationId: string): string {
  return `org:${organizationId}:agent-queue`;
}
