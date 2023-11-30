import { type LibSQLDatabase } from 'drizzle-orm/libsql';
import { type DatabaseSchema } from './schema';
export * from './schema';

export type AppDatabase = LibSQLDatabase<DatabaseSchema>;

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
