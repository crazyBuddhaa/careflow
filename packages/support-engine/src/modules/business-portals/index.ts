import type { BusinessPortalConfig } from '@careflow/shared';

export interface TenantResolutionResult {
  kind: 'central-platform' | 'business-portal' | 'unknown-domain';
  hostname: string;
  businessSlug?: string;
}

export interface BusinessPortalRegistryPort {
  resolveByHostname(hostname: string): Promise<BusinessPortalConfig | null>;
  resolveBySlug(slug: string): Promise<BusinessPortalConfig | null>;
  listPublicPortalSlugs(): Promise<string[]>;
}

const DEFAULT_PLATFORM_DOMAINS = [
  'careflow.com',
  'www.careflow.com',
  'localhost',
  '127.0.0.1',
];

/**
 * Normalizes an incoming HTTP Host header (stripping port and lowercasing)
 * and determines whether the request targets the central CareFlow platform
 * or a tenant subdomain / custom hostname.
 *
 * Security rule: Tenant resolution is derived strictly from the server-verified
 * hostname or server-controlled route parameter—never from a client-supplied
 * organizationId body/header field.
 */
export function classifyTenantHostname(
  rawHostHeader: string | null | undefined,
  platformBaseDomains: string[] = DEFAULT_PLATFORM_DOMAINS
): TenantResolutionResult {
  const cleaned = (rawHostHeader ?? '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');

  if (!cleaned) {
    return { kind: 'central-platform', hostname: 'localhost' };
  }

  // Exact match on central platform domains or ephemeral dev preview domains
  if (
    platformBaseDomains.includes(cleaned) ||
    cleaned.endsWith('.run.app') ||
    cleaned.endsWith('.pages.dev') ||
    cleaned.endsWith('.workers.dev') ||
    cleaned.endsWith('.vercel.app')
  ) {
    return { kind: 'central-platform', hostname: cleaned };
  }

  // Subdomain of *.careflow.com or *.localhost (e.g., ultimatetechapp.careflow.com or ultimatetechapp.localhost)
  for (const base of ['careflow.com', 'localhost']) {
    const suffix = `.${base}`;
    if (cleaned.endsWith(suffix)) {
      const sub = cleaned.slice(0, -suffix.length);
      if (sub && sub !== 'www' && /^[a-z0-9-]+$/.test(sub)) {
        return {
          kind: 'business-portal',
          hostname: cleaned,
          businessSlug: sub,
        };
      }
    }
  }

  // Otherwise treat as candidate custom domain to look up in verified domain mappings
  return {
    kind: 'unknown-domain',
    hostname: cleaned,
  };
}
