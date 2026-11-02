import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  D1DatabaseLike,
  D1PreparedStatement,
  D1Result,
} from './d1-types';

function assertServerSideRuntime(): void {
  if (typeof window !== 'undefined') {
    throw new Error('Security Violation: NodeSqliteD1Adapter cannot run in browser code.');
  }
}

function loadNodeSqliteModule(): typeof import('node:sqlite') {
  const getBuiltin = (
    process as unknown as { getBuiltinModule?: (id: string) => unknown }
  ).getBuiltinModule;

  if (typeof getBuiltin !== 'function') {
    throw new Error(
      'Node.js built-in module loader is unavailable in this runtime. Bind Cloudflare D1 ("DB") when running on Cloudflare Workers.'
    );
  }

  const sqliteMod = getBuiltin('node:sqlite') as typeof import('node:sqlite') | undefined;
  if (!sqliteMod?.DatabaseSync) {
    throw new Error(
      'Built-in "node:sqlite" is unavailable in this runtime. Bind Cloudflare D1 ("DB") when running on Cloudflare Workers.'
    );
  }

  return sqliteMod;
}

function ensureParentDirectory(sqliteFilePath: string): void {
  if (sqliteFilePath === ':memory:') {
    return;
  }
  const getBuiltin = (
    process as unknown as { getBuiltinModule?: (id: string) => unknown }
  ).getBuiltinModule;
  if (typeof getBuiltin !== 'function') {
    return;
  }
  const fsMod = getBuiltin('node:fs') as typeof import('node:fs') | undefined;
  const pathMod = getBuiltin('node:path') as typeof import('node:path') | undefined;
  if (fsMod && pathMod) {
    fsMod.mkdirSync(pathMod.dirname(sqliteFilePath), { recursive: true });
  }
}

class NodeSqlitePreparedStatement implements D1PreparedStatement {
  private boundParams: SQLInputValue[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    const clone = new NodeSqlitePreparedStatement(this.db, this.sql);
    clone.boundParams = values.map((v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
      if (v instanceof Uint8Array) return v;
      return JSON.stringify(v);
    });
    return clone;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.boundParams) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) {
      return (row[colName] as T) ?? null;
    }
    return row as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const start = performance.now();
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...this.boundParams) as T[];
    return {
      results: rows,
      success: true,
      meta: {
        duration: performance.now() - start,
      },
    };
  }

  async run(): Promise<D1Result<Record<string, unknown>>> {
    const start = performance.now();
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.boundParams);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
        duration: performance.now() - start,
      },
    };
  }
}

export class NodeSqliteD1Adapter implements D1DatabaseLike {
  private readonly db: DatabaseSync;

  constructor(sqliteFilePath: string) {
    assertServerSideRuntime();
    const { DatabaseSync: DatabaseSyncCtor } = loadNodeSqliteModule();
    ensureParentDirectory(sqliteFilePath);
    this.db = new DatabaseSyncCtor(sqliteFilePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(query: string): D1PreparedStatement {
    return new NodeSqlitePreparedStatement(this.db, query);
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    const start = performance.now();
    this.db.exec(query);
    return {
      count: 1,
      duration: performance.now() - start,
    };
  }

  close(): void {
    this.db.close();
  }
}

export function isNodeSqliteAvailable(): boolean {
  if (typeof window !== 'undefined') {
    return false;
  }
  const getBuiltin = (
    process as unknown as { getBuiltinModule?: (id: string) => unknown }
  ).getBuiltinModule;
  if (typeof getBuiltin !== 'function') {
    return false;
  }
  try {
    const sqliteMod = getBuiltin('node:sqlite') as { DatabaseSync?: unknown } | undefined;
    return typeof sqliteMod?.DatabaseSync === 'function';
  } catch {
    return false;
  }
}
