/**
 * Minimal async libSQL/SQLite adapter shared by the collector (writes) and the build-time strategy
 * reader. Local `file:` URLs use Node's built-in `node:sqlite` (zero dependency); remote Turso URLs
 * use the optional `@libsql/client` package, loaded on demand so non-remote setups never need it.
 */
export interface InsightsDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  all(sql: string, params?: unknown[]): Promise<Record<string, any>[]>;
  close(): void;
}

const REMOTE_URL = /^(libsql|wss?|https?):\/\//i;

export function isRemoteInsightsUrl(url: string): boolean {
  return REMOTE_URL.test(url);
}

/** @internal — exported for tests; use {@link openInsightsDb}. */
export async function openLibsql(url: string, authToken?: string): Promise<InsightsDb> {
  let createClient;
  try {
    ({ createClient } = await import('@libsql/client'));
  } catch {
    throw new Error(
      `Remote insights URL "${url}" needs the optional "@libsql/client" package. Install it with: npm i @libsql/client`
    );
  }
  // intMode 'number' matches node:sqlite so both backends return the same value types.
  const config = { url, intMode: 'number' as const, ...(authToken ? { authToken } : {}) };
  const client = createClient(config);
  return {
    exec: async (sql) => {
      await client.executeMultiple(sql);
    },
    run: async (sql, params = []) => {
      const result = await client.execute({ sql, args: params as any });
      return { changes: Number(result.rowsAffected) };
    },
    all: async (sql, params = []) => {
      const result = await client.execute({ sql, args: params as any });
      // Normalize libSQL Row objects to plain records (named columns only, no numeric indices).
      return result.rows.map((row) => {
        const record: Record<string, any> = {};
        for (const column of result.columns) {
          record[column] = (row as any)[column];
        }
        return record;
      });
    },
    close: () => client.close(),
  };
}

/** @internal — exported for tests; use {@link openInsightsDb}. */
export async function openNodeSqlite(path: string): Promise<InsightsDb> {
  // Lazy import keeps the experimental-SQLite warning out of processes that never touch insights.
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path);
  return {
    exec: async (sql) => db.exec(sql),
    run: async (sql, params = []) => {
      const result = db.prepare(sql).run(...(params as any[]));
      return { changes: Number(result.changes) };
    },
    all: async (sql, params = []) =>
      db.prepare(sql).all(...(params as any[])) as Record<string, any>[],
    close: () => db.close(),
  };
}

/** Open a libSQL/SQLite connection, picking the backend from the URL scheme. */
export function openInsightsDb(url: string, authToken?: string): Promise<InsightsDb> {
  if (isRemoteInsightsUrl(url)) {
    return openLibsql(url, authToken);
  }
  return openNodeSqlite(url.replace(/^file:/, ''));
}
