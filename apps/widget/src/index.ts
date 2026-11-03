import { CAREFLOW_VERSION, SupportChannel } from '@careflow/shared';

export interface CareFlowWidgetMountConfig {
  /**
   * Public widget token (`wgt_...`) generated when a business activates its Website Chat Widget.
   * Internal organization IDs are never exposed in public widget scripts.
   */
  publicToken?: string;
  /**
   * Legacy fallback slug (optional).
   */
  organizationSlug?: string;
  apiBaseUrl: string;
  containerSelector?: string;
  customerExternalRef?: string;
  customerName?: string;
  customerEmail?: string;
}

export interface CareFlowWidgetMessageResponse {
  conversationId: string;
  status: string;
  botReply: string;
  escalated: boolean;
  deduplicated: boolean;
  messages: Array<{
    id: string;
    senderName: string;
    senderType: string;
    body: string;
    timestamp: string;
  }>;
}

export interface CareFlowWidgetController {
  readonly version: string;
  readonly channel: SupportChannel.WebWidget;
  getConfig(): Readonly<CareFlowWidgetMountConfig>;
  sendMessage(input: {
    message: string;
    sessionRef?: string;
    customerName?: string;
    customerEmail?: string;
    category?: string;
    escalateToHuman?: boolean;
    idempotencyKey?: string;
  }): Promise<CareFlowWidgetMessageResponse>;
  unmount(): void;
}

/**
 * Client SDK for the optional embeddable CustomCare website support widget.
 * Communicates with `/api/widget/[publicToken]` backed by Cloudflare D1.
 */
export function createCareFlowWidget(
  config: CareFlowWidgetMountConfig
): CareFlowWidgetController {
  if ((!config.publicToken && !config.organizationSlug) || !config.apiBaseUrl) {
    throw new Error(
      'CareFlowWidget requires a publicToken (or organizationSlug) and apiBaseUrl.'
    );
  }

  const frozenConfig: Readonly<CareFlowWidgetMountConfig> = Object.freeze({ ...config });
  const baseUrl = config.apiBaseUrl.replace(/\/+$/, '');

  return {
    version: CAREFLOW_VERSION,
    channel: SupportChannel.WebWidget,
    getConfig() {
      return frozenConfig;
    },
    async sendMessage(input) {
      if (!frozenConfig.publicToken) {
        throw new Error('A publicToken (wgt_...) is required to send widget messages.');
      }
      const res = await fetch(
        `${baseUrl}/api/widget/${encodeURIComponent(frozenConfig.publicToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: input.message,
            sessionRef: input.sessionRef ?? frozenConfig.customerExternalRef,
            customerName: input.customerName ?? frozenConfig.customerName,
            customerEmail: input.customerEmail ?? frozenConfig.customerEmail,
            category: input.category,
            escalateToHuman: input.escalateToHuman,
            idempotencyKey: input.idempotencyKey,
          }),
        }
      );
      const body = (await res.json()) as {
        ok: boolean;
        data?: CareFlowWidgetMessageResponse;
        error?: { message: string };
      };
      if (!body.ok || !body.data) {
        throw new Error(body.error?.message || 'Unable to send widget message.');
      }
      return body.data;
    },
    unmount() {
      // Widget DOM teardown hook
    },
  };
}
