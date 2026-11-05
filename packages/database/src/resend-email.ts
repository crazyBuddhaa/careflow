import { CAREFLOW_LOGO_ICON_PATH, type EmailDeliveryResult } from '@careflow/shared';

export interface ResendRuntimeConfig {
  apiKey?: string;
  fromAddress?: string;
  fromName?: string;
  appBaseUrl?: string;
  authCallbackUrl?: string;
  exposeDevTokens?: boolean;
}

export type CustomCareEmailTemplateKey =
  | 'email_verification'
  | 'password_reset'
  | 'password_changed'
  | 'new_login_alert'
  | 'workspace_invitation';

export interface CustomCareRenderedEmail {
  templateKey: CustomCareEmailTemplateKey;
  categoryBadge: string;
  watermarkId: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  replyTo: string;
  devPreviewUrl?: string;
  devToken?: string;
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
      : 'CustomCare Support');

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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createWatermarkReferenceId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `CC-${prefix}-${ts}-${rand}`;
}

interface BrandedEmailDocumentInput {
  appBaseUrl: string;
  fromAddress: string;
  recipientEmail: string;
  categoryBadge: string;
  watermarkId: string;
  headline: string;
  greetingName?: string;
  leadParagraph: string;
  secondaryParagraph?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  tokenLabel?: string;
  tokenValue?: string;
  metadataRows?: Array<{ label: string; value: string }>;
  expiryNotice: string;
}

/**
 * Builds a responsive, watermarked, logo-branded HTML email document that adheres strictly to
 * Google / Gmail Bulk & Transactional Sender Guidelines:
 * - Official CustomCare Q Atelier logo + `.CUSTOMCARE` anti-phishing watermark seal
 * - Table-based responsive layout with high-contrast typography (no external stylesheets or JS)
 * - Visible HTTPS destination URLs matching the sender domain
 * - Explicit reason for receiving the transactional email + anti-phishing guarantee
 * - Direct links to Privacy Policy, Terms of Service, and Compliance pages
 */
export function buildCustomCareBrandedEmailHtml(input: BrandedEmailDocumentInput): string {
  const safeBaseUrl = escapeHtml(input.appBaseUrl);
  const logoUrl = `${safeBaseUrl}${CAREFLOW_LOGO_ICON_PATH}`;
  const safeBadge = escapeHtml(input.categoryBadge);
  const safeWatermark = escapeHtml(input.watermarkId);
  const safeHeadline = escapeHtml(input.headline);
  const safeGreeting = input.greetingName ? `Hello ${escapeHtml(input.greetingName)},` : 'Hello,';
  const safeRecipient = escapeHtml(input.recipientEmail);
  const safeFrom = escapeHtml(input.fromAddress || 'support@getcustomcare.xyz');
  const safeExpiry = escapeHtml(input.expiryNotice);

  const ctaSectionHtml =
    input.ctaLabel && input.ctaUrl
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 26px 0 20px;">
          <tr>
            <td align="center" bgcolor="#0d9488" style="border-radius: 12px; background-color: #0d9488;">
              <a href="${escapeHtml(input.ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 26px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px;">
                ${escapeHtml(input.ctaLabel)} &rarr;
              </a>
            </td>
          </tr>
        </table>
      `
      : '';

  const tokenBoxHtml =
    input.tokenLabel && input.tokenValue
      ? `
        <div style="margin: 20px 0; padding: 16px 18px; border-radius: 12px; background-color: #f8fafc; border: 1px solid #cbd5e1; position: relative;">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #0f766e; margin-bottom: 6px;">
            ${escapeHtml(input.tokenLabel)} &middot; WATERMARK ${safeWatermark}
          </div>
          <code style="display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; font-weight: 700; color: #0f172a; word-break: break-all; padding: 8px 10px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
            ${escapeHtml(input.tokenValue)}
          </code>
          ${
            input.ctaUrl
              ? `<div style="margin-top: 10px; font-size: 11px; line-height: 1.5; color: #64748b; word-break: break-all;">
                   Direct link: <a href="${escapeHtml(input.ctaUrl)}" style="color: #0d9488; text-decoration: underline;">${escapeHtml(input.ctaUrl)}</a>
                 </div>`
              : ''
          }
        </div>
      `
      : '';

  const metadataTableHtml =
    input.metadataRows && input.metadataRows.length > 0
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 18px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          ${input.metadataRows
            .map(
              (row, idx) => `
              <tr>
                <td style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; border-bottom: ${
                  idx < input.metadataRows!.length - 1 ? '1px solid #e2e8f0' : 'none'
                }; width: 38%;">
                  ${escapeHtml(row.label)}
                </td>
                <td style="padding: 10px 14px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #0f172a; border-bottom: ${
                  idx < input.metadataRows!.length - 1 ? '1px solid #e2e8f0' : 'none'
                };">
                  ${escapeHtml(row.value)}
                </td>
              </tr>
            `
            )
            .join('')}
        </table>
      `
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${safeHeadline}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);">
          
          <!-- Top Brand & Watermark Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 20px 28px; border-bottom: 3px solid #0d9488;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right: 12px;">
                          <img src="${logoUrl}" alt="CustomCare Logo" width="38" height="38" style="display: block; width: 38px; height: 38px; border-radius: 10px; background-color: #ffffff; padding: 2px; border: 1px solid #334155;" />
                        </td>
                        <td valign="middle">
                          <div style="font-size: 16px; font-weight: 800; letter-spacing: 0.04em; color: #ffffff;">
                            .CUSTOMCARE
                          </div>
                          <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #5eead4;">
                            Verified Workspace Dispatch
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; padding: 5px 10px; border-radius: 8px; background-color: #1e293b; border: 1px solid #334155; font-size: 11px; font-weight: 700; color: #99f6e4; text-transform: uppercase; letter-spacing: 0.06em;">
                      ${safeBadge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Subtle Anti-Phishing Watermark Ribbon -->
          <tr>
            <td style="background-color: #f0fdfa; padding: 8px 28px; border-bottom: 1px solid #ccfbf1; font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #0f766e; letter-spacing: 0.08em; text-transform: uppercase;">
              AUTHENTICITY WATERMARK: ${safeWatermark} &bull; RECIPIENT: ${safeRecipient}
            </td>
          </tr>

          <!-- Main Email Content Body -->
          <tr>
            <td style="padding: 30px 28px 24px; background-image: radial-gradient(#e2e8f0 0.75px, transparent 0.75px); background-size: 18px 18px;">
              <div style="background-color: rgba(255, 255, 255, 0.96); padding: 4px; border-radius: 12px;">
                <h1 style="margin: 0 0 14px; font-size: 22px; line-height: 1.3; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                  ${safeHeadline}
                </h1>
                <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.65; color: #334155; font-weight: 600;">
                  ${safeGreeting}
                </p>
                <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.65; color: #334155;">
                  ${input.leadParagraph}
                </p>
                ${
                  input.secondaryParagraph
                    ? `<p style="margin: 0 0 14px; font-size: 14px; line-height: 1.65; color: #475569;">${input.secondaryParagraph}</p>`
                    : ''
                }

                ${ctaSectionHtml}
                ${tokenBoxHtml}
                ${metadataTableHtml}

                <p style="margin: 20px 0 0; font-size: 12px; line-height: 1.6; color: #64748b;">
                  ${safeExpiry}
                </p>
              </div>
            </td>
          </tr>

          <!-- Official Watermark Seal & Anti-Phishing Notice -->
          <tr>
            <td style="padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" width="32" style="padding-right: 12px;">
                    <img src="${logoUrl}" alt="" width="28" height="28" style="display: block; width: 28px; height: 28px; border-radius: 7px; opacity: 0.85;" />
                  </td>
                  <td valign="middle" style="font-size: 11px; line-height: 1.5; color: #475569;">
                    <strong style="color: #0f172a;">CustomCare Anti-Phishing Seal (${safeWatermark}):</strong>
                    CustomCare staff will never ask for your password, 2FA authenticator code, or recovery keys by email. Always verify links begin with <span style="font-family: monospace; color: #0f766e;">${safeBaseUrl}</span>.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Google / Gmail Bulk & Transactional Sender Compliance Footer -->
          <tr>
            <td style="padding: 20px 28px; background-color: #ffffff; font-size: 11px; line-height: 1.6; color: #64748b;">
              <p style="margin: 0 0 8px;">
                This is a mandatory transactional service notification sent by <strong>CustomCare</strong> (<a href="${safeBaseUrl}" style="color: #0d9488; text-decoration: none;">${safeBaseUrl}</a>) to <strong>${safeRecipient}</strong> regarding an action on your account or workspace.
              </p>
              <p style="margin: 0 0 8px;">
                Need assistance? Reply directly to <a href="mailto:${safeFrom}" style="color: #0d9488; text-decoration: none;">${safeFrom}</a>.
              </p>
              <p style="margin: 0; color: #94a3b8;">
                <a href="${safeBaseUrl}/privacy" style="color: #64748b; text-decoration: underline;">Privacy Policy</a>
                &nbsp;&bull;&nbsp;
                <a href="${safeBaseUrl}/terms" style="color: #64748b; text-decoration: underline;">Terms of Service</a>
                &nbsp;&bull;&nbsp;
                <a href="${safeBaseUrl}/compliance" style="color: #64748b; text-decoration: underline;">Acceptable Use &amp; Compliance</a>
                &nbsp;&bull;&nbsp;
                &copy; ${new Date().getUTCFullYear()} CustomCare (.CUSTOMCARE)
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  replyTo?: string;
  devPreviewUrl?: string;
  devToken?: string;
}

/**
 * Dispatches transactional authentication emails through Resend's HTTPS API (`https://api.resend.com/emails`).
 * Adheres to Google / Gmail Sender Guidelines by including `reply_to`, `X-Entity-Ref-ID`,
 * `Auto-Submitted: auto-generated`, and synchronized `text/plain` + `text/html` bodies.
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
      errorMessage: 'Transactional email service is currently in preview/setup mode.',
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

    const cleanReplyTo = input.replyTo || cfg.fromAddress;
    const entityRefId =
      input.headers?.['X-Entity-Ref-ID'] || createWatermarkReferenceId('MSG');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: formattedFrom,
        to: [input.to],
        reply_to: cleanReplyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: {
          'X-Entity-Ref-ID': entityRefId,
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
          ...(input.headers ?? {}),
        },
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
        errorMessage: body.message || `Resend HTTP ${response.status}`,
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
  const watermarkId = createWatermarkReferenceId('VER');

  const subject = 'Confirm your CustomCare account email address';
  const text = [
    `.CUSTOMCARE — VERIFIED WORKSPACE DISPATCH (${watermarkId})`,
    '',
    `Hello ${params.fullName},`,
    '',
    'Thank you for registering on CustomCare. Please confirm your email address to activate full workspace publishing and security administration:',
    verifyUrl,
    '',
    `Single-use verification code: ${params.rawToken}`,
    '',
    'This verification link expires in 24 hours and can only be used once. If you did not create a CustomCare account, no further action is needed.',
    '',
    `---`,
    `CustomCare (${cfg.appBaseUrl})`,
    `Privacy Policy: ${cfg.appBaseUrl}/privacy | Terms: ${cfg.appBaseUrl}/terms`,
  ].join('\n');

  const html = buildCustomCareBrandedEmailHtml({
    appBaseUrl: cfg.appBaseUrl,
    fromAddress: cfg.fromAddress || 'support@getcustomcare.xyz',
    recipientEmail: params.to,
    categoryBadge: 'Email Verification',
    watermarkId,
    headline: 'Confirm your CustomCare email address',
    greetingName: params.fullName,
    leadParagraph:
      'Welcome to <strong>CustomCare</strong>. Please confirm your email address to unlock full workspace portal publishing, team invitations, and account security controls.',
    ctaLabel: 'Confirm Email Address',
    ctaUrl: verifyUrl,
    tokenLabel: 'Single-Use Verification Code',
    tokenValue: params.rawToken,
    expiryNotice:
      'This single-use verification link expires in 24 hours. If you did not create a CustomCare account, you can safely disregard this message.',
  });

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
      headers: { 'X-Entity-Ref-ID': watermarkId },
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
  const watermarkId = createWatermarkReferenceId('RST');

  const subject = 'Reset your CustomCare account password';
  const text = [
    `.CUSTOMCARE — VERIFIED WORKSPACE DISPATCH (${watermarkId})`,
    '',
    `Hello ${params.fullName},`,
    '',
    'We received a request to reset the password for your CustomCare account. All existing sessions will be signed out when your password is changed.',
    '',
    `Password reset link: ${resetUrl}`,
    `Single-use recovery token: ${params.rawToken}`,
    '',
    'This single-use token expires in 1 hour. If you did not request a password reset, no changes have been made to your account.',
    '',
    `---`,
    `CustomCare (${cfg.appBaseUrl})`,
    `Privacy Policy: ${cfg.appBaseUrl}/privacy | Terms: ${cfg.appBaseUrl}/terms`,
  ].join('\n');

  const html = buildCustomCareBrandedEmailHtml({
    appBaseUrl: cfg.appBaseUrl,
    fromAddress: cfg.fromAddress || 'support@getcustomcare.xyz',
    recipientEmail: params.to,
    categoryBadge: 'Password Recovery',
    watermarkId,
    headline: 'Reset your CustomCare password',
    greetingName: params.fullName,
    leadParagraph:
      'We received a request to reset the password for your <strong>CustomCare</strong> account. Use the button below to choose a new password. For your protection, all active sessions will be signed out once your password is updated.',
    ctaLabel: 'Choose a New Password',
    ctaUrl: resetUrl,
    tokenLabel: 'Single-Use Recovery Token',
    tokenValue: params.rawToken,
    expiryNotice:
      'This recovery token expires in 1 hour and can only be used once. If you did not request a password reset, your account remains secure and no changes were made.',
  });

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
      headers: { 'X-Entity-Ref-ID': watermarkId },
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
  const cfg = resolveResendConfig(configOverrides, envSource);
  const timestamp = new Date().toUTCString();
  const watermarkId = createWatermarkReferenceId('PWD');

  const subject = 'Security notice: Your CustomCare password was updated';
  const text = [
    `.CUSTOMCARE — VERIFIED WORKSPACE DISPATCH (${watermarkId})`,
    '',
    `Hello ${params.fullName},`,
    '',
    `Your CustomCare account password was updated on ${timestamp}.`,
    `IP Address: ${params.ipAddress || 'Unknown'}`,
    `Device / Browser: ${params.userAgent || 'Unknown'}`,
    '',
    `If you made this change, no further action is needed. If you did not authorize this update, please reset your password immediately at ${cfg.authCallbackUrl}.`,
    '',
    `---`,
    `CustomCare (${cfg.appBaseUrl})`,
    `Privacy Policy: ${cfg.appBaseUrl}/privacy | Terms: ${cfg.appBaseUrl}/terms`,
  ].join('\n');

  const html = buildCustomCareBrandedEmailHtml({
    appBaseUrl: cfg.appBaseUrl,
    fromAddress: cfg.fromAddress || 'support@getcustomcare.xyz',
    recipientEmail: params.to,
    categoryBadge: 'Security Alert',
    watermarkId,
    headline: 'Your CustomCare password was updated',
    greetingName: params.fullName,
    leadParagraph: `This is an automated security confirmation that the password for your <strong>CustomCare</strong> account was changed on <strong>${escapeHtml(timestamp)}</strong>.`,
    metadataRows: [
      { label: 'Event Timestamp', value: timestamp },
      { label: 'IP Address', value: params.ipAddress || 'Unknown' },
      { label: 'Browser / Device', value: params.userAgent || 'Unknown' },
      { label: 'Active Sessions', value: 'Previous sessions revoked automatically' },
    ],
    ctaLabel: 'Review Account Security',
    ctaUrl: `${cfg.appBaseUrl}/admin`,
    expiryNotice:
      'If you performed this password update, no further action is required. If you did not authorize this change, reset your password immediately.',
  });

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
      headers: { 'X-Entity-Ref-ID': watermarkId },
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
  const cfg = resolveResendConfig(configOverrides, envSource);
  const timestamp = new Date().toUTCString();
  const watermarkId = createWatermarkReferenceId('LGN');

  const subject = 'New sign-in to your CustomCare account';
  const text = [
    `.CUSTOMCARE — VERIFIED WORKSPACE DISPATCH (${watermarkId})`,
    '',
    `Hello ${params.fullName},`,
    '',
    `A new sign-in to your CustomCare account was recorded on ${timestamp}.`,
    params.organizationName ? `Active Workspace: ${params.organizationName}` : '',
    `IP Address: ${params.ipAddress || 'Unknown'}`,
    `Device / Browser: ${params.userAgent || 'Unknown'}`,
    '',
    `If this was you, you can disregard this notice. Otherwise, review your active sessions and enable Two-Factor Authentication (2FA) at ${cfg.appBaseUrl}/admin.`,
    '',
    `---`,
    `CustomCare (${cfg.appBaseUrl})`,
    `Privacy Policy: ${cfg.appBaseUrl}/privacy | Terms: ${cfg.appBaseUrl}/terms`,
  ]
    .filter(Boolean)
    .join('\n');

  const metadataRows: Array<{ label: string; value: string }> = [
    ...(params.organizationName
      ? [{ label: 'Workspace', value: params.organizationName }]
      : []),
    { label: 'Sign-In Time', value: timestamp },
    { label: 'IP Address', value: params.ipAddress || 'Unknown' },
    { label: 'Browser / Device', value: params.userAgent || 'Unknown' },
  ];

  const html = buildCustomCareBrandedEmailHtml({
    appBaseUrl: cfg.appBaseUrl,
    fromAddress: cfg.fromAddress || 'support@getcustomcare.xyz',
    recipientEmail: params.to,
    categoryBadge: 'Sign-In Notice',
    watermarkId,
    headline: 'New sign-in to your CustomCare account',
    greetingName: params.fullName,
    leadParagraph: `We noticed a new sign-in to your <strong>CustomCare</strong> account on <strong>${escapeHtml(timestamp)}</strong>.`,
    metadataRows,
    ctaLabel: 'Manage Active Sessions',
    ctaUrl: `${cfg.appBaseUrl}/admin`,
    expiryNotice:
      'If this sign-in was you, no action is needed. If you do not recognize this activity, revoke the session in Account Security and update your password.',
  });

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
      headers: { 'X-Entity-Ref-ID': watermarkId },
    },
    configOverrides,
    envSource
  );
}

export async function sendWorkspaceInvitationEmail(
  params: {
    to: string;
    organizationName: string;
    invitedByName: string;
    role: string;
    department?: string;
    rawToken: string;
    expiresAt: string;
  },
  configOverrides?: Partial<ResendRuntimeConfig>,
  envSource?: Record<string, unknown>
): Promise<EmailDeliveryResult> {
  const cfg = resolveResendConfig(configOverrides, envSource);
  const inviteUrl = `${cfg.appBaseUrl}/invite/${encodeURIComponent(params.rawToken)}`;
  const watermarkId = createWatermarkReferenceId('INV');
  const formattedExpiry = (() => {
    try {
      return new Date(params.expiresAt).toUTCString();
    } catch {
      return params.expiresAt;
    }
  })();

  const subject = `Invitation to join ${params.organizationName} on CustomCare`;
  const text = [
    `.CUSTOMCARE — VERIFIED WORKSPACE DISPATCH (${watermarkId})`,
    '',
    'Hello,',
    '',
    `${params.invitedByName} has invited you to join the ${params.organizationName} support workspace on CustomCare as a ${params.role}${params.department ? ` (${params.department})` : ''}.`,
    '',
    `Accept your invitation: ${inviteUrl}`,
    `Single-use invitation token: ${params.rawToken}`,
    '',
    'You can accept this invitation as a Business-Managed Agent (scoped strictly to this workspace) or link it to a personal CustomCare account.',
    `This invitation link is single-use and expires on ${formattedExpiry}.`,
    '',
    `---`,
    `CustomCare (${cfg.appBaseUrl})`,
    `Privacy Policy: ${cfg.appBaseUrl}/privacy | Terms: ${cfg.appBaseUrl}/terms`,
  ].join('\n');

  const safeInviter = escapeHtml(params.invitedByName);
  const safeOrg = escapeHtml(params.organizationName);

  const html = buildCustomCareBrandedEmailHtml({
    appBaseUrl: cfg.appBaseUrl,
    fromAddress: cfg.fromAddress || 'support@getcustomcare.xyz',
    recipientEmail: params.to,
    categoryBadge: 'Workspace Invitation',
    watermarkId,
    headline: `Join ${params.organizationName} on CustomCare`,
    leadParagraph: `<strong>${safeInviter}</strong> has invited you to collaborate in the <strong>${safeOrg}</strong> customer support workspace on CustomCare.`,
    secondaryParagraph:
      'You can accept this invitation as a Business-Managed Agent (dedicated to this workspace) or connect it to a Personal CustomCare Account to switch across workspaces.',
    metadataRows: [
      { label: 'Organization Workspace', value: params.organizationName },
      { label: 'Invited By', value: params.invitedByName },
      { label: 'Assigned Role', value: params.role.toUpperCase() },
      ...(params.department ? [{ label: 'Department / Queue', value: params.department }] : []),
      { label: 'Expires On', value: formattedExpiry },
    ],
    ctaLabel: 'Accept Workspace Invitation',
    ctaUrl: inviteUrl,
    tokenLabel: 'Single-Use Invitation Token',
    tokenValue: params.rawToken,
    expiryNotice: `This invitation is single-use, expires on ${formattedExpiry}, and can be revoked by the workspace administrator at any time.`,
  });

  return sendTransactionalEmail(
    {
      to: params.to,
      subject,
      html,
      text,
      headers: { 'X-Entity-Ref-ID': watermarkId },
      devPreviewUrl: inviteUrl,
      devToken: params.rawToken,
    },
    configOverrides,
    envSource
  );
}

/**
 * Generates rendered previews for all 5 official CustomCare email templates so Platform Super-Admins
 * can inspect the watermarked layout, logo placement, plain-text parity, and Google compliance headers.
 */
export function getCustomCareEmailTemplateGallery(
  envSource?: Record<string, unknown>
): CustomCareRenderedEmail[] {
  const cfg = resolveResendConfig(undefined, envSource);
  const baseUrl = cfg.appBaseUrl || 'https://getcustomcare.xyz';
  const fromAddr = cfg.fromAddress || 'support@getcustomcare.xyz';
  const sampleRecipient = 'oluwafemiadekanmi76@gmail.com';
  const nowUtc = new Date().toUTCString();

  const buildItem = (
    templateKey: CustomCareEmailTemplateKey,
    categoryBadge: string,
    watermarkPrefix: string,
    subject: string,
    docInput: Omit<
      BrandedEmailDocumentInput,
      'appBaseUrl' | 'fromAddress' | 'recipientEmail' | 'categoryBadge' | 'watermarkId'
    >,
    plainLines: string[]
  ): CustomCareRenderedEmail => {
    const watermarkId = `CC-${watermarkPrefix}-2026-VERIFIED`;
    const html = buildCustomCareBrandedEmailHtml({
      appBaseUrl: baseUrl,
      fromAddress: fromAddr,
      recipientEmail: sampleRecipient,
      categoryBadge,
      watermarkId,
      ...docInput,
    });
    const text = [
      `.CUSTOMCARE — VERIFIED WORKSPACE DISPATCH (${watermarkId})`,
      '',
      ...plainLines,
      '',
      '---',
      `CustomCare (${baseUrl})`,
      `Privacy Policy: ${baseUrl}/privacy | Terms: ${baseUrl}/terms | Compliance: ${baseUrl}/compliance`,
    ].join('\n');

    return {
      templateKey,
      categoryBadge,
      watermarkId,
      subject,
      html,
      text,
      replyTo: fromAddr,
      headers: {
        'X-Entity-Ref-ID': watermarkId,
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
    };
  };

  return [
    buildItem(
      'email_verification',
      'Email Verification',
      'VER',
      'Confirm your CustomCare account email address',
      {
        headline: 'Confirm your CustomCare email address',
        greetingName: 'Oluwafemi Adekanmi',
        leadParagraph:
          'Welcome to <strong>CustomCare</strong>. Please confirm your email address to unlock full workspace portal publishing, team invitations, and account security controls.',
        ctaLabel: 'Confirm Email Address',
        ctaUrl: `${baseUrl}/login?action=verify-email&token=cc_verify_sample_token_9f8a7b6c`,
        tokenLabel: 'Single-Use Verification Code',
        tokenValue: 'cc_verify_sample_token_9f8a7b6c',
        expiryNotice:
          'This single-use verification link expires in 24 hours. If you did not create a CustomCare account, you can safely disregard this message.',
      },
      [
        'Hello Oluwafemi Adekanmi,',
        '',
        'Thank you for registering on CustomCare. Please confirm your email address to activate full workspace publishing and security administration:',
        `${baseUrl}/login?action=verify-email&token=cc_verify_sample_token_9f8a7b6c`,
        '',
        'Single-use verification code: cc_verify_sample_token_9f8a7b6c',
      ]
    ),
    buildItem(
      'password_reset',
      'Password Recovery',
      'RST',
      'Reset your CustomCare account password',
      {
        headline: 'Reset your CustomCare password',
        greetingName: 'Oluwafemi Adekanmi',
        leadParagraph:
          'We received a request to reset the password for your <strong>CustomCare</strong> account. Use the button below to choose a new password. For your protection, all active sessions will be signed out once your password is updated.',
        ctaLabel: 'Choose a New Password',
        ctaUrl: `${baseUrl}/login?action=reset-password&token=cc_reset_sample_token_4d3e2f1a`,
        tokenLabel: 'Single-Use Recovery Token',
        tokenValue: 'cc_reset_sample_token_4d3e2f1a',
        expiryNotice:
          'This recovery token expires in 1 hour and can only be used once. If you did not request a password reset, your account remains secure and no changes were made.',
      },
      [
        'Hello Oluwafemi Adekanmi,',
        '',
        'We received a request to reset the password for your CustomCare account.',
        `Password reset link: ${baseUrl}/login?action=reset-password&token=cc_reset_sample_token_4d3e2f1a`,
        'Single-use recovery token: cc_reset_sample_token_4d3e2f1a',
      ]
    ),
    buildItem(
      'password_changed',
      'Security Alert',
      'PWD',
      'Security notice: Your CustomCare password was updated',
      {
        headline: 'Your CustomCare password was updated',
        greetingName: 'Oluwafemi Adekanmi',
        leadParagraph: `This is an automated security confirmation that the password for your <strong>CustomCare</strong> account was changed on <strong>${escapeHtml(nowUtc)}</strong>.`,
        metadataRows: [
          { label: 'Event Timestamp', value: nowUtc },
          { label: 'IP Address', value: '198.51.100.42' },
          { label: 'Browser / Device', value: 'Chrome 131.0 on macOS' },
          { label: 'Active Sessions', value: 'Previous sessions revoked automatically' },
        ],
        ctaLabel: 'Review Account Security',
        ctaUrl: `${baseUrl}/admin`,
        expiryNotice:
          'If you performed this password update, no further action is required. If you did not authorize this change, reset your password immediately.',
      },
      [
        'Hello Oluwafemi Adekanmi,',
        '',
        `Your CustomCare account password was updated on ${nowUtc}.`,
        'IP Address: 198.51.100.42',
        'Device / Browser: Chrome 131.0 on macOS',
      ]
    ),
    buildItem(
      'new_login_alert',
      'Sign-In Notice',
      'LGN',
      'New sign-in to your CustomCare account',
      {
        headline: 'New sign-in to your CustomCare account',
        greetingName: 'Oluwafemi Adekanmi',
        leadParagraph: `We noticed a new sign-in to your <strong>CustomCare</strong> account on <strong>${escapeHtml(nowUtc)}</strong>.`,
        metadataRows: [
          { label: 'Workspace', value: 'CustomCare Operations' },
          { label: 'Sign-In Time', value: nowUtc },
          { label: 'IP Address', value: '198.51.100.42' },
          { label: 'Browser / Device', value: 'Chrome 131.0 on macOS' },
        ],
        ctaLabel: 'Manage Active Sessions',
        ctaUrl: `${baseUrl}/admin`,
        expiryNotice:
          'If this sign-in was you, no action is needed. If you do not recognize this activity, revoke the session in Account Security and update your password.',
      },
      [
        'Hello Oluwafemi Adekanmi,',
        '',
        `A new sign-in to your CustomCare account was recorded on ${nowUtc}.`,
        'Workspace: CustomCare Operations',
        'IP Address: 198.51.100.42',
      ]
    ),
    buildItem(
      'workspace_invitation',
      'Workspace Invitation',
      'INV',
      'Invitation to join CustomCare Operations on CustomCare',
      {
        headline: 'Join CustomCare Operations on CustomCare',
        leadParagraph:
          '<strong>Oluwafemi Adekanmi</strong> has invited you to collaborate in the <strong>CustomCare Operations</strong> customer support workspace on CustomCare.',
        secondaryParagraph:
          'You can accept this invitation as a Business-Managed Agent (dedicated to this workspace) or connect it to a Personal CustomCare Account to switch across workspaces.',
        metadataRows: [
          { label: 'Organization Workspace', value: 'CustomCare Operations' },
          { label: 'Invited By', value: 'Oluwafemi Adekanmi' },
          { label: 'Assigned Role', value: 'SUPERVISOR' },
          { label: 'Department / Queue', value: 'Billing & Escalations' },
          { label: 'Expires On', value: new Date(Date.now() + 72 * 3600 * 1000).toUTCString() },
        ],
        ctaLabel: 'Accept Workspace Invitation',
        ctaUrl: `${baseUrl}/invite/cc_invite_sample_token_8a7b6c5d`,
        tokenLabel: 'Single-Use Invitation Token',
        tokenValue: 'cc_invite_sample_token_8a7b6c5d',
        expiryNotice:
          'This invitation is single-use, expires in 72 hours, and can be revoked by the workspace administrator at any time.',
      },
      [
        'Hello,',
        '',
        'Oluwafemi Adekanmi has invited you to join the CustomCare Operations support workspace on CustomCare as a SUPERVISOR (Billing & Escalations).',
        `Accept your invitation: ${baseUrl}/invite/cc_invite_sample_token_8a7b6c5d`,
      ]
    ),
  ];
}
