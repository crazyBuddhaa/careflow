import type { EmailDeliveryResult } from '@careflow/shared';

export interface ResendRuntimeConfig {
  apiKey?: string;
  fromAddress?: string;
  fromName?: string;
  appBaseUrl?: string;
  authCallbackUrl?: string;
  exposeDevTokens?: boolean;
}

/**
 * Resolves Resend and URL configuration from runtime environment variables or Cloudflare Worker secrets.
 * Never invents a fake custom domain (`careflow.com`) when none is configured.
 */
export function resolveResendConfig(
  overrides?: Partial<ResendRuntimeConfig>,
  envSource: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {}
): Required<
  Pick<ResendRuntimeConfig, 'fromName' | 'appBaseUrl' | 'authCallbackUrl' | 'exposeDevTokens'>
> & {
  apiKey: string;
  fromAddress: string;
  isConfigured: boolean;
  hasCustomSenderDomain: boolean;
} {
  const rawApiKey =
    overrides?.apiKey ??
    (typeof envSource.RESEND_API_KEY === 'string' ? envSource.RESEND_API_KEY.trim() : '');

  const rawFromAddress =
    overrides?.fromAddress ??
    (typeof envSource.CAREFLOW_EMAIL_FROM_ADDRESS === 'string'
      ? envSource.CAREFLOW_EMAIL_FROM_ADDRESS.trim()
      : '');

  const fromName =
    overrides?.fromName ||
    (typeof envSource.CAREFLOW_EMAIL_FROM_NAME === 'string' &&
    envSource.CAREFLOW_EMAIL_FROM_NAME.trim().length > 0
      ? envSource.CAREFLOW_EMAIL_FROM_NAME.trim()
      : 'CustomCare Security');

  const appBaseUrl = (
    overrides?.appBaseUrl ||
    (typeof envSource.CAREFLOW_APP_BASE_URL === 'string' &&
    envSource.CAREFLOW_APP_BASE_URL.trim().length > 0
      ? envSource.CAREFLOW_APP_BASE_URL.trim()
      : typeof envSource.NEXT_PUBLIC_APP_URL === 'string' &&
          envSource.NEXT_PUBLIC_APP_URL.trim().length > 0
        ? envSource.NEXT_PUBLIC_APP_URL.trim()
        : 'http://localhost:3000')
  ).replace(/\/+$/, '');

  const authCallbackUrl = (
    overrides?.authCallbackUrl ||
    (typeof envSource.CAREFLOW_AUTH_CALLBACK_URL === 'string' &&
    envSource.CAREFLOW_AUTH_CALLBACK_URL.trim().length > 0
      ? envSource.CAREFLOW_AUTH_CALLBACK_URL.trim()
      : `${appBaseUrl}/login`)
  ).replace(/\/+$/, '');

  const isProd = envSource.NODE_ENV === 'production';
  const exposeDevTokens =
    overrides?.exposeDevTokens ??
    (envSource.CAREFLOW_EXPOSE_DEV_AUTH_TOKENS === 'true' || !isProd);

  const hasCustomSenderDomain = Boolean(
    rawFromAddress &&
      rawFromAddress.includes('@') &&
      !rawFromAddress.endsWith('@resend.dev') &&
      !rawFromAddress.endsWith('.local') &&
      !rawFromAddress.endsWith('.example')
  );

  const isConfigured = Boolean(rawApiKey && rawFromAddress && rawFromAddress.includes('@'));

  return {
    apiKey: rawApiKey,
    fromAddress: rawFromAddress,
    fromName,
    appBaseUrl,
    authCallbackUrl,
    exposeDevTokens,
    isConfigured,
    hasCustomSenderDomain,
  };
}

export interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  devPreviewUrl?: string;
  devToken?: string;
}

/**
 * Dispatches transactional authentication emails through Resend's HTTPS API (`https://api.resend.com/emails`).
 * Works natively on Cloudflare Workers and Node.js without extra SDK dependencies.
 * Gracefully handles unconfigured domain/API key states so development on a `.workers.dev` URL is never blocked.
 */
export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
  configOverrides?: Partial<ResendRuntimeConfig>,
  envSource?: Record<string, unknown>
): Promise<EmailDeliveryResult> {
  const cfg = resolveResendConfig(configOverrides, envSource);

  if (!cfg.isConfigured) {
    return {
      sent: false,
      provider: 'unconfigured',
      errorMessage:
        'Resend transactional email delivery is not configured yet (requires RESEND_API_KEY and CAREFLOW_EMAIL_FROM_ADDRESS with a verified domain).',
      ...(cfg.exposeDevTokens
        ? {
            devPreviewUrl: input.devPreviewUrl,
            devToken: input.devToken,
          }
        : {}),
    };
  }

  try {
    const formattedFrom = cfg.fromAddress.includes('<')
      ? cfg.fromAddress
      : `${cfg.fromName} <${cfg.fromAddress}>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: formattedFrom,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      return {
        sent: false,
        provider: 'resend',
        fromAddress: cfg.fromAddress,
        errorMessage:
          body.message || `Resend API rejected email delivery (HTTP ${response.status}).`,
        ...(cfg.exposeDevTokens
          ? {
              devPreviewUrl: input.devPreviewUrl,
              devToken: input.devToken,
            }
          : {}),
      };
    }

    return {
      sent: true,
      provider: 'resend',
      fromAddress: cfg.fromAddress,
      messageId: body.id,
    };
  } catch (err) {
    return {
      sent: false,
      provider: 'resend',
      fromAddress: cfg.fromAddress,
      errorMessage:
        err instanceof Error ? err.message : 'Network error while contacting Resend API.',
      ...(cfg.exposeDevTokens
        ? {
            devPreviewUrl: input.devPreviewUrl,
            devToken: input.devToken,
          }
        : {}),
    };
  }
}

export async function sendEmailVerificationMessage(
  params: {
    to: string;
    fullName: string;
    rawToken: string;
  },
  configOverrides?: Partial<ResendRuntimeConfig>,
  envSource?: Record<string, unknown>
): Promise<EmailDeliveryResult> {
  const cfg = resolveResendConfig(configOverrides, envSource);
  const verifyUrl = `${cfg.authCallbackUrl}?action=verify-email&token=${encodeURIComponent(
    params.rawToken
  )}`;

  const subject = 'Verify your CustomCare account email';
  const text = [
    `Hello ${params.fullName},`,
    '',
    'Welcome to CustomCare. Please verify your email address to enable sensitive workspace operations:',
    verifyUrl,
    '',
    `Verification token: ${params.rawToken}`,
    '',
    'This single-use verification link expires in 24 hours. If you did not create a CustomCare account, you can safely ignore this message.',
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin: 0 0 12px; font-size: 20px;">Verify your CustomCare account</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hello ${params.fullName},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Please confirm your email address to unlock full workspace publishing and security operations on CustomCare.
      </p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 600; font-size: 14px; display: inline-block;">
          Verify Email Address
        </a>
      </p>
      <p style="font-size: 12px; color: #64748b;">
        Or enter this single-use verification token in your dashboard: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${params.rawToken}</code>
      </p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
        This link expires in 24 hours and can only be used once.
      </p>
    </div>
  `;

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
      devPreviewUrl: verifyUrl,
      devToken: params.rawToken,
    },
    configOverrides,
    envSource
  );
}

export async function sendPasswordResetMessage(
  params: {
    to: string;
    fullName: string;
    rawToken: string;
  },
  configOverrides?: Partial<ResendRuntimeConfig>,
  envSource?: Record<string, unknown>
): Promise<EmailDeliveryResult> {
  const cfg = resolveResendConfig(configOverrides, envSource);
  const resetUrl = `${cfg.authCallbackUrl}?action=reset-password&token=${encodeURIComponent(
    params.rawToken
  )}`;

  const subject = 'Reset your CustomCare account password';
  const text = [
    `Hello ${params.fullName},`,
    '',
    'We received a request to reset the password for your CustomCare account.',
    `Reset link: ${resetUrl}`,
    `Single-use reset token: ${params.rawToken}`,
    '',
    'This token expires in 1 hour and can only be used once. If you did not request a password reset, no changes have been made to your account.',
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin: 0 0 12px; font-size: 20px;">Reset your CustomCare password</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hello ${params.fullName},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Use the button below to choose a new password for your CustomCare account. All existing sessions will be signed out when your password is changed.
      </p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 600; font-size: 14px; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 12px; color: #64748b;">
        Single-use reset token: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${params.rawToken}</code>
      </p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
        This token expires in 1 hour. If you did not request this reset, you can safely ignore this email.
      </p>
    </div>
  `;

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
      devPreviewUrl: resetUrl,
      devToken: params.rawToken,
    },
    configOverrides,
    envSource
  );
}

export async function sendPasswordChangedAlert(
  params: {
    to: string;
    fullName: string;
    ipAddress: string;
    userAgent: string;
  },
  configOverrides?: Partial<ResendRuntimeConfig>,
  envSource?: Record<string, unknown>
): Promise<EmailDeliveryResult> {
  const timestamp = new Date().toUTCString();
  const subject = 'Security alert: Your CustomCare password was changed';
  const text = [
    `Hello ${params.fullName},`,
    '',
    `Your CustomCare account password was changed on ${timestamp}.`,
    `IP Address: ${params.ipAddress || 'Unknown'}`,
    `Device / Browser: ${params.userAgent || 'Unknown'}`,
    '',
    'If you made this change, no further action is needed. If you did not authorize this change, reset your password immediately and review your active sessions.',
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin: 0 0 12px; font-size: 20px;">Your CustomCare password was changed</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hello ${params.fullName},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        This is an automated security notification confirming that your CustomCare password was updated on <strong>${timestamp}</strong>.
      </p>
      <ul style="font-size: 13px; color: #475569; line-height: 1.6;">
        <li><strong>IP address:</strong> ${params.ipAddress || 'Unknown'}</li>
        <li><strong>Device:</strong> ${params.userAgent || 'Unknown'}</li>
      </ul>
    </div>
  `;

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
    },
    configOverrides,
    envSource
  );
}

export async function sendNewLoginSecurityAlert(
  params: {
    to: string;
    fullName: string;
    ipAddress: string;
    userAgent: string;
    organizationName?: string;
  },
  configOverrides?: Partial<ResendRuntimeConfig>,
  envSource?: Record<string, unknown>
): Promise<EmailDeliveryResult> {
  const timestamp = new Date().toUTCString();
  const subject = 'New sign-in to your CustomCare account';
  const text = [
    `Hello ${params.fullName},`,
    '',
    `A new sign-in to your CustomCare account was recorded on ${timestamp}.`,
    params.organizationName ? `Active Workspace: ${params.organizationName}` : '',
    `IP Address: ${params.ipAddress || 'Unknown'}`,
    `Device / Browser: ${params.userAgent || 'Unknown'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin: 0 0 12px; font-size: 20px;">New sign-in to CustomCare</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hello ${params.fullName},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        We noticed a new sign-in to your CustomCare account on <strong>${timestamp}</strong>.
      </p>
      <ul style="font-size: 13px; color: #475569; line-height: 1.6;">
        ${params.organizationName ? `<li><strong>Workspace:</strong> ${params.organizationName}</li>` : ''}
        <li><strong>IP address:</strong> ${params.ipAddress || 'Unknown'}</li>
        <li><strong>Device:</strong> ${params.userAgent || 'Unknown'}</li>
      </ul>
    </div>
  `;

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
    },
    configOverrides,
    envSource
  );
}
