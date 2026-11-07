import {
  type ReplacementInventoryStatus,
  UserRole,
  type WorkspacePermissionKey,
} from '@careflow/shared';
import { hasMinimumRole } from '@careflow/support-engine';
import {
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getOperationsManagementService } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const url = new URL(request.url);
    const orgId = auth.session.identity.organizationId;
    const opsService = await getOperationsManagementService();

    const categoryId = url.searchParams.get('categoryId') || undefined;
    const status = (url.searchParams.get('status') || undefined) as
      | ReplacementInventoryStatus
      | 'all'
      | undefined;
    const productOrService =
      url.searchParams.get('productOrService') ||
      url.searchParams.get('productName') ||
      undefined;

    const [categories, items, batches, movements, config] = await Promise.all([
      opsService.listInventoryCategories(orgId),
      opsService.listInventoryItems(orgId, {
        categoryId,
        status,
        productOrService,
      }),
      opsService.listStockBatches(orgId, categoryId),
      opsService.listInventoryMovements(orgId, 150),
      opsService.getOperationsConfig(orgId),
    ]);

    return jsonApiSuccess({
      categories,
      items,
      batches,
      movements,
      config,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Supervisor);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }
    if (!hasMinimumRole(auth.session.identity, UserRole.Supervisor)) {
      return jsonApiError(
        'FORBIDDEN',
        'Supervisor or Administrator role required to manage replacement inventory.',
        403
      );
    }

    const orgId = auth.session.identity.organizationId;
    const actor = {
      userId: auth.session.identity.userId,
      userName: auth.session.userName || auth.session.identity.email || 'Supervisor',
      userEmail: auth.session.identity.email || '',
      userRole: auth.session.identity.role,
      permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
    };

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    const opsService = await getOperationsManagementService();

    if (action === 'create_category' || action === 'update_category') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const productOrService =
        typeof body.productOrService === 'string' && body.productOrService.trim()
          ? body.productOrService.trim()
          : name;
      if (!name) {
        return jsonApiError('VALIDATION_ERROR', 'Inventory category name is required.', 400);
      }

      const upserted = await opsService.upsertInventoryCategory(orgId, actor, {
        id: typeof body.categoryId === 'string' ? body.categoryId : undefined,
        name,
        productOrService,
        description: typeof body.description === 'string' ? body.description : undefined,
        minStockThreshold:
          typeof body.minStockThreshold === 'number' ? body.minStockThreshold : 5,
      });
      return jsonApiSuccess(upserted, 201);
    }

    if (action === 'add_item' || action === 'add_stock' || action === 'bulk_import') {
      const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
      if (!categoryId) {
        return jsonApiError('VALIDATION_ERROR', 'Inventory categoryId is required.', 400);
      }

      let credentialsList: string[] = [];
      if (Array.isArray(body.credentialsList)) {
        credentialsList = body.credentialsList.map((c) => String(c));
      } else if (typeof body.rawCredentialsText === 'string') {
        credentialsList = body.rawCredentialsText.split(/\r?\n/);
      } else if (Array.isArray(body.items)) {
        credentialsList = body.items.map((item: unknown) => {
          if (typeof item === 'string') return item;
          const rec = (item || {}) as Record<string, unknown>;
          return [rec.accountIdentifier, rec.accountSecret, rec.additionalDetails]
            .filter(Boolean)
            .join(' | ');
        });
      } else if (typeof body.accountIdentifier === 'string') {
        credentialsList = [
          [body.accountIdentifier, body.accountSecret, body.additionalDetails]
            .filter(Boolean)
            .join(' | '),
        ];
      }

      const result = await opsService.addReplacementStock(orgId, actor, {
        categoryId,
        batchCode:
          typeof body.batchCode === 'string'
            ? body.batchCode
            : typeof body.batchName === 'string'
              ? body.batchName
              : undefined,
        supplierRef:
          typeof body.supplierRef === 'string'
            ? body.supplierRef
            : typeof body.supplierOrSource === 'string'
              ? body.supplierOrSource
              : undefined,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        credentialsList,
      });

      return jsonApiSuccess(result, 201);
    }

    return jsonApiError('VALIDATION_ERROR', `Unsupported inventory action "${action}".`, 400);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}
