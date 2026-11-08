import { UserRole } from '@careflow/shared';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getOperationsManagementService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ businessSlug: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { businessSlug } = await context.params;
    const workspaceRepo = await getWorkspaceRepository();
    const business = await workspaceRepo.resolvePortalBySlug(businessSlug);
    if (!business) {
      return jsonApiError('NOT_FOUND', 'Support portal not found.', 404);
    }

    const url = new URL(request.url);
    const referenceCode = url.searchParams.get('referenceCode')?.trim();
    const customerEmail = url.searchParams.get('customerEmail')?.trim().toLowerCase();

    const opsService = await getOperationsManagementService();
    const allCategories = await opsService.listComplaintCategories(business.organizationId);
    const categories = allCategories.filter((c) => c.isActive);

    if (referenceCode && customerEmail) {
      const matches = await opsService.listComplaints(business.organizationId, {
        search: referenceCode,
      });
      const found = matches.find(
        (c) =>
          c.referenceCode.toUpperCase() === referenceCode.toUpperCase() &&
          c.customerEmail.toLowerCase() === customerEmail
      );
      if (!found) {
        return jsonApiError(
          'NOT_FOUND',
          'No matching complaint found for that reference code and email address.',
          404
        );
      }

      // Return customer-safe status summary (never expose internal comments or raw credentials)
      return jsonApiSuccess({
        complaint: {
          referenceCode: found.referenceCode,
          orderId: found.orderId,
          productOrService: found.productOrService,
          categoryName: found.categoryName,
          status: found.status,
          priority: found.priority,
          decisionOutcome: found.decision,
          decisionReason:
            found.status === 'approved' ||
            found.status === 'declined' ||
            found.status === 'awaiting_information' ||
            found.status === 'resolved'
              ? found.decisionReason
              : null,
          replacementIssued: Boolean(found.deliveredAt),
          createdAt: found.createdAt,
          updatedAt: found.updatedAt,
          resolvedAt: found.resolvedAt,
        },
      });
    }

    return jsonApiSuccess({
      categories,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { businessSlug } = await context.params;
    const workspaceRepo = await getWorkspaceRepository();
    const business = await workspaceRepo.resolvePortalBySlug(businessSlug);
    if (!business) {
      return jsonApiError('NOT_FOUND', 'Support portal not found.', 404);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.action === 'submit_feedback') {
      const opsService = await getOperationsManagementService();
      const referenceCode =
        typeof body.referenceCode === 'string' ? body.referenceCode.trim() : '';
      const customerEmail =
        typeof body.customerEmail === 'string' ? body.customerEmail.trim().toLowerCase() : '';
      const customerName =
        typeof body.customerName === 'string' && body.customerName.trim()
          ? body.customerName.trim()
          : customerEmail || 'Portal Customer';
      const rating = Number(body.rating ?? 5);
      const comment = typeof body.comment === 'string' ? body.comment.trim() : undefined;

      let complaintId: string | undefined;
      if (referenceCode) {
        const matches = await opsService.listComplaints(business.organizationId, {
          search: referenceCode,
        });
        const found = matches.find(
          (c) => c.referenceCode.toUpperCase() === referenceCode.toUpperCase(),
        );
        if (found) {
          complaintId = found.id;
        }
      }

      const feedback = await opsService.submitCustomerFeedback(business.organizationId, {
        complaintId,
        caseReference: referenceCode || undefined,
        customerName,
        customerEmail,
        rating,
        comment,
      });
      return jsonApiSuccess({ feedback }, 201);
    }

    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : '';
    const productOrService =
      typeof body.productOrService === 'string' ? body.productOrService.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    if (!customerName || !customerEmail || !productOrService || !description) {
      return jsonApiError(
        'VALIDATION_ERROR',
        'Your name, email address, purchased product/service, and issue description are required.',
        400
      );
    }

    let loginInfo = typeof body.loginInfo === 'string' ? body.loginInfo.trim() : '';
    if (!loginInfo) {
      const parts = [
        typeof body.suppliedLoginIdentifier === 'string' ? body.suppliedLoginIdentifier.trim() : '',
        typeof body.suppliedLoginSecret === 'string' ? body.suppliedLoginSecret.trim() : '',
        typeof body.suppliedLoginNotes === 'string' ? body.suppliedLoginNotes.trim() : '',
      ].filter(Boolean);
      loginInfo = parts.join(' | ');
    }

    const customFieldsRaw = body.customFields ?? body.customFieldValues;
    const customFields =
      customFieldsRaw && typeof customFieldsRaw === 'object'
        ? (customFieldsRaw as Record<string, string>)
        : undefined;

    const opsService = await getOperationsManagementService();
    const created = await opsService.createComplaint(
      business.organizationId,
      {
        userId: customerEmail,
        userName: customerName,
        userEmail: customerEmail,
        userRole: UserRole.Customer,
      },
      {
        conversationId:
          typeof body.conversationId === 'string'
            ? body.conversationId
            : typeof body.linkedConversationId === 'string'
              ? body.linkedConversationId
              : undefined,
        customerName,
        customerEmail,
        orderId: typeof body.orderId === 'string' ? body.orderId.trim() : undefined,
        productOrService,
        categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
        categoryName: typeof body.categoryName === 'string' ? body.categoryName : undefined,
        description,
        loginInfo: loginInfo || undefined,
        customFields,
      }
    );

    if (typeof body.evidenceTitle === 'string' && body.evidenceTitle.trim()) {
      await opsService.addComplaintEvidence(
        business.organizationId,
        created.id,
        {
          userId: customerEmail,
          userName: customerName,
          userEmail: customerEmail,
          userRole: UserRole.Customer,
        },
        {
          fileName: body.evidenceTitle.trim(),
          fileUrlOrData:
            typeof body.evidenceUrlOrData === 'string' && body.evidenceUrlOrData.trim()
              ? body.evidenceUrlOrData.trim()
              : 'evidence://customer-upload',
          description: body.evidenceTitle.trim(),
        }
      );
    }

    return jsonApiSuccess(
      {
        referenceCode: created.referenceCode,
        status: created.status,
        isPotentialDuplicate: created.isPotentialDuplicate,
        createdAt: created.createdAt,
      },
      201
    );
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}
