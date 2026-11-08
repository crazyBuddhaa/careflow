export const CAREFLOW_VERSION = '0.2.0';
export const CAREFLOW_NAME = 'CustomCare';
export const CUSTOMCARE_NAME = 'CustomCare';
export const CUSTOMCARE_BRAND_WORDMARK = '.CUSTOMCARE';
export const CUSTOMCARE_DOMAIN = 'getcustomcare.xyz';
export const CAREFLOW_TAGLINE = 'Smarter Support. Better Experiences.';
export const CUSTOMCARE_MISSION_STATEMENT =
  'Helping businesses manage customer support, automate conversations, and deliver better customer experiences.';
export const INITIAL_CLIENT_NAME = 'CustomCare';
export const INITIAL_CLIENT_SLUG = 'customcare';
export const CENTRAL_TELEGRAM_BOT_USERNAME = 'getcustomcarebot';

export const CUSTOMCARE_LOGO_ICON_URL =
  '/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000821_1_12ad5e9f.png';
export const CAREFLOW_LOGO_ICON_PATH = CUSTOMCARE_LOGO_ICON_URL;
export const CUSTOMCARE_LOGO_COMPACT_URL =
  '/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000722_2_8854e50e.png';
export const CUSTOMCARE_LOGO_FULL_URL =
  '/assets/aistudio/Black_White_Minimalist_Simple_Modern_Bold_Letter_Q_Atelier_Logo_20261104_000639_0000_84dc5aab.png';

export const DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS = [
  'admin@getcustomcare.xyz',
] as const;

export function getRegisteredPlatformSuperAdminEmails(
  envSource?: Record<string, unknown>
): string[] {
  const allowed = new Set<string>(
    DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS.map((email) => email.toLowerCase())
  );
  const envObj =
    envSource ?? (typeof process !== 'undefined' ? process.env : undefined);
  const rawList = [
    envObj?.CAREFLOW_SUPER_ADMIN_EMAILS,
    envObj?.CAREFLOW_PLATFORM_ADMIN_EMAILS,
    envObj?.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(',');

  if (rawList) {
    for (const part of rawList.split(',')) {
      const cleaned = part.trim().toLowerCase();
      if (cleaned) {
        allowed.add(cleaned);
      }
    }
  }
  return Array.from(allowed);
}

export function isRegisteredPlatformSuperAdminEmail(
  email?: string | null,
  envSource?: Record<string, unknown>
): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return getRegisteredPlatformSuperAdminEmails(envSource).includes(normalized);
}
