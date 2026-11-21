/**
 * Minimal async libSQL/SQLite adapter shared by the collector (writes) and the build-time strategy
 * reader. Local `file:` URLs use Node's built-in `node:sqlite` (Node 22.5+, zero dependency) and
 * fall back to the optional `@libsql/client` package on older Node; remote Turso URLs always use
 * `@libsql/client`, loaded on demand so other setups never need it.
 */
/** @internal */
export interface InsightsStatement {
  sql: string;
  args: unknown[];
}

/** @internal */
export interface InsightsDb {
  exec(sql: string): Promise<void>;
  /** Run statements in one transaction: all apply or none do. */
  batch(statements: InsightsStatement[]): Promise<void>;
  all(sql: string, params?: unknown[]): Promise<Record<string, any>[]>;
  close(): void;
}

const REMOTE_URL = /^(libsql|wss?|https?):\/\//i;

export function isRemoteInsightsUrl(url: string): boolean {
  return REMOTE_URL.test(url);
}

/**
 * An environment variable, or undefined where there is no `process` (e.g. Cloudflare Workers).
 *
 * @internal
 */
export const readInsightsEnv = (name: string): string | undefined =>
  typeof process === 'undefined' ? undefined : process.env[name];

/** @internal — exported for tests; use {@link openInsightsDb}. */
export async function openLibsql(
  url: string,
  authToken?: string,
  missingPackageHint = 'Remote insights DB URLs need'
): Promise<InsightsDb> {
  let createClient;
  try {
    ({ createClient } = await import('@libsql/client'));
  } catch {
    throw new Error(
      `${missingPackageHint} the optional "@libsql/client" package. Install it with: npm i @libsql/client`
    );
  }
  // intMode 'number' matches node:sqlite so both backends return the same value types.
  const config = { url, intMode: 'number' as const, ...(authToken ? { authToken } : {}) };
  return libsqlInsightsDb(createClient(config));
}

/**
 * The parts of a `@libsql/client` client the adapter uses.
 *
 * @internal
 */
export interface LibsqlClientLike {
  executeMultiple(sql: string): Promise<unknown>;
  batch(statements: any[], mode: 'write'): Promise<unknown>;
  execute(statement: { sql: string; args: any }): Promise<{ rows: any[]; columns: string[] }>;
  close(): void;
}

/**
 * Adapt an existing `@libsql/client` client, e.g. one an app already opened.
 *
 * @internal
 */
export function libsqlInsightsDb(client: LibsqlClientLike): InsightsDb {
  return {
    exec: async (sql) => {
      await client.executeMultiple(sql);
    },
    batch: async (statements) => {
      await client.batch(statements, 'write');
    },
    all: async (sql, params = []) => {
      const result = await client.execute({ sql, args: params });
      // Normalize libSQL Row objects to plain records (named columns only, no numeric indices).
      return result.rows.map((row) => {
        const record: Record<string, any> = {};
        for (let i = 0; i < result.columns.length; i++) {
          const column = result.columns[i];
          record[column] = row[column];
        }
        return record;
      });
    },
    close: () => client.close(),
  };
}

// The dashboard schema's foreign keys are declarative only (one targets a non-unique column), as
// on its production database; local drivers enforce them by default.
const FOREIGN_KEYS_OFF = 'PRAGMA foreign_keys = OFF';

/** @internal — exported for tests; use {@link openInsightsDb}. */
export async function openNodeSqlite(
  path: string,
  sqlite?: typeof import('node:sqlite')
): Promise<InsightsDb> {
  // Lazy import keeps the experimental-SQLite warning out of processes that never touch insights.
  const { DatabaseSync } = sqlite ?? (await import('node:sqlite'));
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  return {
    exec: async (sql) => db.exec(sql),
    // Synchronous between BEGIN and COMMIT, so concurrent beacons can't interleave.
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        for (let i = 0; i < statements.length; i++) {
          db.prepare(statements[i].sql).run(...(statements[i].args as any[]));
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    all: async (sql, params = []) =>
      db.prepare(sql).all(...(params as any[])) as Record<string, any>[],
    close: () => db.close(),
  };
}

/**
 * Hide an auth token embedded in a libSQL URL before it is logged or displayed.
 *
 * @internal
 */
export function redactInsightsDbUrl(url: string): string {
  return url.replace(/((?:[\w-]|%[0-9a-f]{2})+)=[^&\s]*/gi, (param, name: string) =>
    /token$/i.test(decodeParamName(name)) ? `${name}=***` : param
  );
}

// libSQL decodes parameter names, so `auth%54oken` is still the auth token.
function decodeParamName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** An error's stack (or message) with any DB token embedded in it redacted. */
export function describeInsightsDbError(error: unknown): string {
  return redactInsightsDbUrl(error instanceof Error ? error.stack || error.message : String(error));
}

/**
 * Filesystem path of a local `file:` URL (`file:rel`, `file:/abs`, `file:///abs`), else null.
 *
 * @internal
 */
export function localInsightsDbPath(url: string): string | null {
  if (isRemoteInsightsUrl(url)) {
    return null;
  }
  // A standard `file:///` URL is percent-encoded (`%20` for a space). Decoded without `node:url`
  // so this module also loads on edge runtimes.
  if (/^file:\/\/(localhost)?\//i.test(url)) {
    const path = decodeURIComponent(new URL(url).pathname);
    return /^\/[a-z]:/i.test(path) ? path.slice(1) : path;
  }
  return url.replace(/^file:/, '');
}

/**
 * Open a libSQL/SQLite connection, picking the backend from the URL scheme.
 *
 * @internal
 */
export async function openInsightsDb(url: string, authToken?: string): Promise<InsightsDb> {
  const path = localInsightsDbPath(url);
  if (path === null) {
    return openLibsql(url, authToken);
  }
  const sqlite = await loadNodeSqlite();
  if (sqlite) {
    return openNodeSqlite(path, sqlite);
  }
  // libSQL reads `#` and `?` as URL syntax and percent-decodes the path.
  const fileUrl = `file:${path.replace(/[%#?]/g, encodeURIComponent)}`;
  const db = await openLibsql(fileUrl, undefined, 'Local insights DBs on Node < 22.5 need');
  await db.exec(FOREIGN_KEYS_OFF);
  return db;
}

/** `node:sqlite`, or null on Node versions that don't ship it. */
async function loadNodeSqlite(): Promise<typeof import('node:sqlite') | null> {
  try {
    return await import('node:sqlite');
  } catch {
    return null;
  }
}
