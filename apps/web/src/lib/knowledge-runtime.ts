import path from 'node:path';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  D1AuthIdentityService,
  D1KnowledgeRepository,
  D1WorkspaceRepository,
  bootstrapKnowledgeD1Schema,
  type D1DatabaseLike,
} from '@careflow/database/d1';
import {
  NodeSqliteD1Adapter,
  isNodeSqliteAvailable,
} from '@careflow/database/sqlite-node';
import { KnowledgeManagementService } from '@careflow/support-engine';

declare global {
  // Preserve singleton SQLite / D1 bootstrap promises across dev reloads & Worker isolate invocations
  var __careflowKnowledgeD1Instance: D1DatabaseLike | undefined;
  var __careflowKnowledgeBootstrapPromise: Promise<void> | undefined;
  var __careflowWorkerD1BootstrapPromise: Promise<void> | undefined;
}

function isD1DatabaseBinding(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { prepare?: unknown }).prepare === 'function'
  );
}

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');

/**
 * Returns the active Cloudflare Worker `env` bindings only when executing inside an
 * initialized OpenNext Cloudflare Worker request context (`runWithCloudflareRequestContext`).
 *
 * Avoids calling `getCloudflareContext({ async: true })` in standard Node.js (`next dev`,
 * `next start`, `next build`), which would otherwise spawn Wrangler's Miniflare/workerd
 * `getPlatformProxy()` against `WORKER_SELF_REFERENCE` and crash `workerd`.
 */
export function getActiveCloudflareEnv(): Record<string, unknown> | null {
  const globalScope = globalThis as Record<symbol, unknown>;
  if (!globalScope[CLOUDFLARE_CONTEXT_SYMBOL]) {
    return null;
  }

  try {
    const context = getCloudflareContext({ async: false });
    const envRecord = context?.env as Record<string, unknown> | undefined;
    return envRecord ?? null;
  } catch {
    return null;
  }
}

function resolveCloudflareD1Binding(): D1DatabaseLike | null {
  const envRecord = getActiveCloudflareEnv();
  if (!envRecord) {
    return null;
  }

  const candidate = envRecord.DB ?? envRecord.CAREFLOW_DB;
  if (isD1DatabaseBinding(candidate)) {
    return candidate;
  }
  return null;
}

function resolveDefaultSqlitePath(): string {
  if (process.env.CAREFLOW_SQLITE_PATH && process.env.CAREFLOW_SQLITE_PATH.trim().length > 0) {
    return process.env.CAREFLOW_SQLITE_PATH.trim();
  }
  const cwd = process.cwd();
  const baseRoot = cwd.endsWith(path.join('apps', 'web'))
    ? path.resolve(cwd, '..', '..')
    : cwd;
  return path.join(baseRoot, '.careflow-data', 'careflow-knowledge.sqlite');
}

export async function getKnowledgeDatabase(): Promise<D1DatabaseLike> {
  // 1. Prefer native Cloudflare Workers D1 binding (`env.DB`) when deployed on Cloudflare
  const cloudflareD1 = resolveCloudflareD1Binding();
  if (cloudflareD1) {
    if (!globalThis.__careflowWorkerD1BootstrapPromise) {
      globalThis.__careflowWorkerD1BootstrapPromise = bootstrapKnowledgeD1Schema(
        cloudflareD1
      ).catch((err) => {
        globalThis.__careflowWorkerD1BootstrapPromise = undefined;
        throw err;
      });
    }
    await globalThis.__careflowWorkerD1BootstrapPromise;
    return cloudflareD1;
  }

  // 2. Fall back to Node's built-in `node:sqlite` during local development & automated tests
  if (isNodeSqliteAvailable()) {
    if (!globalThis.__careflowKnowledgeD1Instance) {
      globalThis.__careflowKnowledgeD1Instance = new NodeSqliteD1Adapter(
        resolveDefaultSqlitePath()
      );
    }

    if (!globalThis.__careflowKnowledgeBootstrapPromise) {
      globalThis.__careflowKnowledgeBootstrapPromise = bootstrapKnowledgeD1Schema(
        globalThis.__careflowKnowledgeD1Instance
      ).catch((err) => {
        globalThis.__careflowKnowledgeBootstrapPromise = undefined;
        throw err;
      });
    }

    await globalThis.__careflowKnowledgeBootstrapPromise;
    return globalThis.__careflowKnowledgeD1Instance;
  }

  // 3. Running inside Cloudflare Workers without a D1 database bound yet
  throw new Error(
    'Cloudflare D1 binding "DB" is not configured on this Worker. Run "npx wrangler d1 create careflow-db" and bind it as "DB" in wrangler.jsonc (or under Worker Settings -> Bindings in the Cloudflare Dashboard).'
  );
}

export async function getKnowledgeManagementService(): Promise<KnowledgeManagementService> {
  const db = await getKnowledgeDatabase();
  const repository = new D1KnowledgeRepository(db);
  return new KnowledgeManagementService(repository);
}

export async function getWorkspaceRepository(): Promise<D1WorkspaceRepository> {
  const db = await getKnowledgeDatabase();
  return new D1WorkspaceRepository(db);
}

export async function getAuthIdentityService(): Promise<D1AuthIdentityService> {
  const db = await getKnowledgeDatabase();
  return new D1AuthIdentityService(db);
}
