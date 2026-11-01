import type { AgentProfile } from '@careflow/shared';

export interface AgentManagementPort {
  listAvailableAgents(organizationId: string): Promise<AgentProfile[]>;
  setAgentAvailability(agentId: string, isAvailable: boolean): Promise<AgentProfile>;
  assignConversation(conversationId: string, agentId: string): Promise<void>;
}
