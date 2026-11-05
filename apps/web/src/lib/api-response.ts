import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  CAREFLOW_VERSION,
  type ApiErrorResponse,
  type ApiSuccessResponse,
} from '@careflow/shared';
import { KnowledgeDomainError } from '@careflow/support-engine';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

const INTERNAL_LEAK_PATTERN =
  /CAREFLOW_|TURNSTILE_SECRET_KEY|RESEND_API_KEY|TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|SQLITE_|D1_ERROR|Security Configuration Error|SyntaxError|TypeError|ReferenceError|ECONNREFUSED|ENOTFOUND|at Object\.|node:internal/i;

const CUSTOM_USER_ERROR_BY_CODE: Record<string, string> = {
  INVALID_JSON: 'We could not process that request. Please refresh the page and try again.',
  CSRF_REJECTED:
    'Your browser security session changed or expired. Please refresh the page and try again.',
  UNAUTHORIZED: 'Please sign in to your CustomCare account to continue.',
  FORBIDDEN: 'You do not have permission to perform this action in the current workspace.',
  NOT_FOUND: 'The requested item or workspace could not be found.',
  TURNSTILE_NOT_CONFIGURED:
    'Security verification is temporarily unavailable. Please try again in a moment.',
  TURNSTILE_FAILED:
    'Please complete the security verification check and try again.',
  TURNSTILE_VERIFICATION_FAILED:
    'Security verification could not be confirmed. Please refresh the challenge and try again.',
  TELEGRAM_TOKEN_MISSING:
    'Telegram bot integration is not yet connected on this server. A Platform Administrator has been notified.',
  INTERNAL_ERROR:
    'We encountered a temporary issue while processing your request. Our team has been notified—please try again in a moment.',
};

function generateErrorRef(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ERR-${randomSuffix}`;
}

export function logInternalErrorForPlatformAdmin(params: {
  errorCode: string;
  internalMessage: string;
  routeOrContext?: string;
  stack?: string;
}): void {
  void getWorkspaceRepository()
    .then((repo) =>
      repo.recordSystemErrorLog({
        errorCode: params.errorCode,
        internalMessage: params.internalMessage,
        routeOrContext: params.routeOrContext,
        stack: params.stack,
      })
    )
    .catch(() => undefined);
}

export function jsonApiSuccess<T>(data: T, status = 200) {
  const payload: ApiSuccessResponse<T> = {
    ok: true,
    data,
    meta: {
      version: CAREFLOW_VERSION,
      timestamp: new Date().toISOString(),
    },
  };
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export function jsonApiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
) {
  let safeUserMessage = message;
  const isInternalOrSensitive =
    status >= 500 || code === 'INTERNAL_ERROR' || INTERNAL_LEAK_PATTERN.test(message);

  if (isInternalOrSensitive) {
    const errorRef = generateErrorRef();
    logInternalErrorForPlatformAdmin({
      errorCode: `${code}:${errorRef}`,
      internalMessage: message,
      routeOrContext: `jsonApiError(${status})`,
    });
    safeUserMessage =
      CUSTOM_USER_ERROR_BY_CODE[code] ||
      `We encountered a temporary issue while processing your request (Ref: ${errorRef}). Our team has been notified—please try again shortly.`;
  } else if (
    (code === 'INVALID_JSON' || code === 'CSRF_REJECTED') &&
    CUSTOM_USER_ERROR_BY_CODE[code]
  ) {
    safeUserMessage = CUSTOM_USER_ERROR_BY_CODE[code];
  }

  const payload: ApiErrorResponse = {
    ok: false,
    error: {
      code,
      message: safeUserMessage,
      ...(status < 500 && details !== undefined ? { details } : {}),
    },
  };
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

const DOMAIN_PREFIX_MAP: Array<{
  prefix: string;
  code: string;
  status: number;
  fallbackMessage?: string;
}> = [
  { prefix: 'VALIDATION_ERROR:', code: 'VALIDATION_ERROR', status: 400 },
  { prefix: 'INVALID_CREDENTIALS:', code: 'INVALID_CREDENTIALS', status: 401 },
  {
    prefix: 'INVALID_MFA_CODE:',
    code: 'INVALID_MFA_CODE',
    status: 401,
    fallbackMessage: 'The verification code you entered is incorrect or has expired. Please try again.',
  },
  { prefix: 'UNAUTHORIZED:', code: 'UNAUTHORIZED', status: 401 },
  { prefix: 'FORBIDDEN:', code: 'FORBIDDEN', status: 403 },
  { prefix: 'CONSENT_REQUIRED:', code: 'CONSENT_REQUIRED', status: 403 },
  { prefix: 'NOT_FOUND:', code: 'NOT_FOUND', status: 404 },
  { prefix: 'CONFLICT:', code: 'CONFLICT', status: 409 },
  { prefix: 'TOKEN_ALREADY_USED:', code: 'TOKEN_ALREADY_USED', status: 409 },
  { prefix: 'MFA_ALREADY_ENABLED:', code: 'MFA_ALREADY_ENABLED', status: 409 },
  { prefix: 'MFA_NOT_ENABLED:', code: 'MFA_NOT_ENABLED', status: 400 },
  { prefix: 'TOKEN_EXPIRED:', code: 'TOKEN_EXPIRED', status: 410 },
  { prefix: 'INVITATION_EXPIRED:', code: 'INVITATION_EXPIRED', status: 410 },
  { prefix: 'INVITATION_REVOKED:', code: 'INVITATION_REVOKED', status: 410 },
  { prefix: 'INVALID_TOKEN:', code: 'INVALID_TOKEN', status: 400 },
  { prefix: 'RATE_LIMITED:', code: 'RATE_LIMITED', status: 429 },
];

export function handleKnowledgeApiException(err: unknown, routeContext?: string) {
  if (err instanceof KnowledgeDomainError) {
    const statusMap: Record<KnowledgeDomainError['code'], number> = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      INVALID_CATEGORY: 422,
    };
    return jsonApiError(err.code, err.message, statusMap[err.code]);
  }

  if (err instanceof ZodError) {
    return jsonApiError(
      'VALIDATION_ERROR',
      err.issues[0]?.message ?? 'Please check the highlighted form fields and try again.',
      422,
      err.flatten().fieldErrors
    );
  }

  if (err instanceof Error) {
    const rawMsg = err.message || '';

    for (const rule of DOMAIN_PREFIX_MAP) {
      if (rawMsg.startsWith(rule.prefix)) {
        const cleanText = rawMsg.slice(rule.prefix.length).trim();
        return jsonApiError(
          rule.code,
          rule.fallbackMessage || cleanText || CUSTOM_USER_ERROR_BY_CODE[rule.code] || 'Unable to complete request.',
          rule.status
        );
      }
    }

    if (rawMsg.startsWith('Cannot publish portal yet.')) {
      return jsonApiError('ONBOARDING_INCOMPLETE', rawMsg, 422);
    }
  }

  const errorRef = generateErrorRef();
  const internalMessage =
    err instanceof Error ? err.message : 'Non-Error exception thrown in API route';
  const stack = err instanceof Error ? err.stack : undefined;

  logInternalErrorForPlatformAdmin({
    errorCode: errorRef,
    internalMessage,
    routeOrContext: routeContext || 'handleKnowledgeApiException',
    stack,
  });

  const payload: ApiErrorResponse = {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: `We encountered a temporary issue while processing your request (Ref: ${errorRef}). Our team has been notified—please try again in a moment.`,
    },
  };
  return NextResponse.json(payload, {
    status: 500,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

