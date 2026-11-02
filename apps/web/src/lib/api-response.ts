import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  CAREFLOW_VERSION,
  type ApiErrorResponse,
  type ApiSuccessResponse,
} from '@careflow/shared';
import { KnowledgeDomainError } from '@careflow/support-engine';

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
  const payload: ApiErrorResponse = {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export function handleKnowledgeApiException(err: unknown) {
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
      err.issues[0]?.message ?? 'Request validation failed.',
      422,
      err.flatten().fieldErrors
    );
  }

  const message =
    err instanceof Error ? err.message : 'An unexpected server error occurred.';
  return jsonApiError('INTERNAL_ERROR', message, 500);
}
