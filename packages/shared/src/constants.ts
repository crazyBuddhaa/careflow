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
  'oluwafemiadekanmi76@gmail.com',
  'admin@getcustomcare.xyz',
] as const;

export function isRegisteredPlatformSuperAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if ((DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS as readonly string[]).includes(normalized)) {
    return true;
  }
  const envList =
    (typeof process !== 'undefined' && process.env?.CAREFLOW_SUPER_ADMIN_EMAILS) || '';
  if (envList) {
    return envList
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .includes(normalized);
  }
  return false;
}
