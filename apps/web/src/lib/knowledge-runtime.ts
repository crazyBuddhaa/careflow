import path from 'node:path';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  D1KnowledgeRepository,
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

async function resolveCloudflareD1Binding(): Promise<D1DatabaseLike | null> {
  try {
    const context = await getCloudflareContext({ async: true });
    const envRecord = context?.env as Record<string, unknown> | undefined;
    if (!envRecord) {
      return null;
    }

    const candidate = envRecord.DB ?? envRecord.CAREFLOW_DB;
    if (isD1DatabaseBinding(candidate)) {
      return candidate;
    }
  } catch {
    // Running outside OpenNext Cloudflare context (e.g., standard `next dev` / `next start`)
  }
  return null;
}

function resolveDefaultSqlitePath(): string {
  if (process.env.CAREFLOW_SQLITE_PATH && process.env.CAREFLOW_SQLITE_PATH.trim().length > 0) {
    return process.env.CAREFLOW_SQLITE_PATH.trim();
  }
  // Store inside workspace .careflow-data/ directory regardless of cwd (root vs apps/web)
  const cwd = process.cwd();
  const baseRoot = cwd.endsWith(path.join('apps', 'web'))
    ? path.resolve(cwd, '..', '..')
    : cwd;
  return path.join(baseRoot, '.careflow-data', 'careflow-knowledge.sqlite');
}

export async function getKnowledgeDatabase(): Promise<D1DatabaseLike> {
  // 1. Prefer native Cloudflare Workers D1 binding (`env.DB`) when deployed on Cloudflare
  const cloudflareD1 = await resolveCloudflareD1Binding();
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
