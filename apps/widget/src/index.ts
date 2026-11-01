import { CAREFLOW_VERSION, SupportChannel } from '@careflow/shared';

export interface CareFlowWidgetMountConfig {
  organizationSlug: string;
  apiBaseUrl: string;
  containerSelector?: string;
  customerExternalRef?: string;
  customerEmail?: string;
}

export interface CareFlowWidgetController {
  readonly version: string;
  readonly channel: SupportChannel.WebWidget;
  getConfig(): Readonly<CareFlowWidgetMountConfig>;
  unmount(): void;
}

/**
 * Structural bootstrapper for the embeddable CareFlow web support widget.
 * Communicates with the unified Next.js REST API and Supabase Realtime channels
 * shared alongside the Telegram integration.
 * Full customer messaging UI is intentionally deferred per v0.1.0 scope.
 */
export function createCareFlowWidget(
  config: CareFlowWidgetMountConfig
): CareFlowWidgetController {
  if (!config.organizationSlug || !config.apiBaseUrl) {
    throw new Error('CareFlowWidget requires both organizationSlug and apiBaseUrl.');
  }

  const frozenConfig: Readonly<CareFlowWidgetMountConfig> = Object.freeze({ ...config });

  return {
    version: CAREFLOW_VERSION,
    channel: SupportChannel.WebWidget,
    getConfig() {
      return frozenConfig;
    },
    unmount() {
      // Widget DOM teardown hook reserved for v0.2 interactive launcher
    },
  };
}
