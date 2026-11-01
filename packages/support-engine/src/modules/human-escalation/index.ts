import type { EscalationPriority, EscalationTicket } from '@careflow/shared';

export interface TriggerEscalationCommand {
  organizationId: string;
  conversationId: string;
  priority: EscalationPriority;
  reason: string;
  diagnosticContext: Record<string, string>;
}

export interface HumanEscalationPort {
  escalateConversation(command: TriggerEscalationCommand): Promise<EscalationTicket>;
  acknowledgeEscalation(ticketId: string, agentId: string): Promise<void>;
}
