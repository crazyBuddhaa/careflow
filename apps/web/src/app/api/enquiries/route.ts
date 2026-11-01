import { NextResponse } from 'next/server';
import { CAREFLOW_VERSION, type ApiErrorResponse, type ApiSuccessResponse } from '@careflow/shared';
import { DeploymentEnquirySchema } from '@careflow/validation';

export interface DeploymentEnquiryReceipt {
  referenceCode: string;
  organization: string;
  primaryChannel: string;
  receivedAt: string;
}

export async function POST(request: Request) {
  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    const invalidJson: ApiErrorResponse = {
      ok: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      },
    };
    return NextResponse.json(invalidJson, { status: 400 });
  }

  const parsed = DeploymentEnquirySchema.safeParse(rawPayload);

  if (!parsed.success) {
    const validationError: ApiErrorResponse = {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid onboarding request payload.',
        details: parsed.error.flatten().fieldErrors,
      },
    };
    return NextResponse.json(validationError, { status: 422 });
  }

  const timestamp = new Date().toISOString();
  const shortHash = Math.random().toString(36).substring(2, 8).toUpperCase();

  const response: ApiSuccessResponse<DeploymentEnquiryReceipt> = {
    ok: true,
    data: {
      referenceCode: `CF-${shortHash}`,
      organization: parsed.data.organization,
      primaryChannel: parsed.data.primaryChannel,
      receivedAt: timestamp,
    },
    meta: {
      version: CAREFLOW_VERSION,
      timestamp,
    },
  };

  return NextResponse.json(response, { status: 201 });
}
