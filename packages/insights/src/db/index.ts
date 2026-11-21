import { type Client } from '@libsql/client';
import { libsqlInsightsDb } from '@qwik.dev/core/insights/collector';
import { type LibSQLDatabase } from 'drizzle-orm/libsql';
import { type DatabaseSchema } from './schema';
export * from './schema';

export type AppDatabase = LibSQLDatabase<DatabaseSchema> & { $client: Client };

let _db!: AppDatabase;

export function getDB() {
  // eslint-disable-next-line
  if (!_db) {
    throw new Error('DB not set');
  }
  return _db;
}

export async function initializeDbIfNeeded(factory: () => Promise<AppDatabase>) {
  // eslint-disable-next-line
  if (!_db) {
    _db = await factory();
  }
}

/** The same connection, for the shared `@qwik.dev/core` collector that records beacons. */
export function getInsightsDb() {
  return libsqlInsightsDb(getDB().$client);
}
