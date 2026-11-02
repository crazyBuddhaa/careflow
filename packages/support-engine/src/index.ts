export const CORE_MODULE_REGISTRY = [
  { key: 'authentication', name: 'Authentication & RBAC', stage: 'scaffolded' as const },
  { key: 'customer-management', name: 'Customer Management', stage: 'scaffolded' as const },
  { key: 'conversations', name: 'Conversations Core', stage: 'scaffolded' as const },
  { key: 'messages', name: 'Messages Ledger', stage: 'scaffolded' as const },
  { key: 'knowledge-base', name: 'Knowledge Base', stage: 'ready' as const },
  { key: 'smart-troubleshooting', name: 'Smart Troubleshooting', stage: 'scaffolded' as const },
  { key: 'human-escalation', name: 'Human Escalation', stage: 'scaffolded' as const },
  { key: 'agent-management', name: 'Agent Management', stage: 'scaffolded' as const },
  { key: 'telegram-integration', name: 'Telegram Channel Adapter', stage: 'scaffolded' as const },
  { key: 'business-portals', name: 'Multi-Business Portal Resolution', stage: 'ready' as const },
];

export * from './modules/authentication';
export * from './modules/customer-management';
export * from './modules/conversations';
export * from './modules/messages';
export * from './modules/knowledge-base';
export * from './modules/smart-troubleshooting';
export * from './modules/human-escalation';
export * from './modules/agent-management';
export * from './modules/telegram-integration';
export * from './modules/business-portals';
