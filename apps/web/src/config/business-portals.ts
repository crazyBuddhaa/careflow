import type { BusinessPortalConfig } from '@careflow/shared';
import {
  DEFAULT_PORTAL_TEMPLATE_PRESET,
  NORTHSTAR_COMMERCE_PRESET,
} from '@careflow/database/d1';
import {
  classifyTenantHostname,
  type BusinessPortalRegistryPort,
} from '@careflow/support-engine';

const REGISTERED_PORTALS: ReadonlyMap<string, BusinessPortalConfig> = new Map([
  [NORTHSTAR_COMMERCE_PRESET.slug, NORTHSTAR_COMMERCE_PRESET],
]);

export const businessPortalRegistry: BusinessPortalRegistryPort = {
  async resolveByHostname(rawHostname: string): Promise<BusinessPortalConfig | null> {
    const classification = classifyTenantHostname(rawHostname);

    if (classification.kind === 'business-portal' && classification.businessSlug) {
      return REGISTERED_PORTALS.get(classification.businessSlug) ?? null;
    }

    if (classification.kind === 'unknown-domain') {
      for (const portal of REGISTERED_PORTALS.values()) {
        if (portal.verifiedHostnames.includes(classification.hostname)) {
          return portal;
        }
      }
    }

    return null;
  },

  async resolveBySlug(slug: string): Promise<BusinessPortalConfig | null> {
    const normalized = slug.trim().toLowerCase();
    return REGISTERED_PORTALS.get(normalized) ?? null;
  },

  async listPublicPortalSlugs(): Promise<string[]> {
    return Array.from(REGISTERED_PORTALS.keys());
  },
};

export function getDefaultPortalTemplateConfig(): BusinessPortalConfig {
  return DEFAULT_PORTAL_TEMPLATE_PRESET;
}

export function getDefaultNorthstarCommerceConfig(): BusinessPortalConfig {
  return NORTHSTAR_COMMERCE_PRESET;
}
