import type { TroubleshootingFlowNode } from '@careflow/shared';

export interface DiagnosticEvaluationResult {
  resolvedSelfService: boolean;
  recommendedArticleSlug?: string;
  shouldEscalateToHuman: boolean;
  collectedContext: Record<string, string>;
}

export interface SmartTroubleshootingPort {
  getEntryNode(organizationId: string, category: string): Promise<TroubleshootingFlowNode | null>;
  evaluateStep(
    flowId: string,
    nodeId: string,
    selectedOptionIndex: number
  ): Promise<DiagnosticEvaluationResult>;
}
