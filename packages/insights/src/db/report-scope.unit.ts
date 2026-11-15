import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { expect, test } from 'vitest';
import type { AppDatabase } from '.';
import { loadReportScope } from './report-scope';

test('keeps error-only builds selectable without borrowing another application’s history', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await client.batch([
      'CREATE TABLE manifests (id INTEGER PRIMARY KEY, public_api_key TEXT, hash TEXT, timestamp INTEGER)',
      'CREATE TABLE errors (public_api_key TEXT, manifest_hash TEXT, timestamp INTEGER)',
      "INSERT INTO manifests VALUES (1, 'app', 'uploaded', 100), (2, 'other', 'error-only', 900)",
      "INSERT INTO errors VALUES ('app', 'error-only', 200), ('app', 'error-only', 300), ('app', 'uploaded', 500), ('other', 'foreign', 900)",
    ]);
    const db = drizzle(client) as AppDatabase;
    const scope = await loadReportScope(db, 'app', new URLSearchParams());
    expect(scope.selectedHash).toBe('error-only');
    expect(scope.previousHash).toBe('uploaded');
    expect(scope.manifests.map(({ hash }) => hash)).toEqual(['error-only', 'uploaded']);
    expect(scope.manifests[0].timestamp).toBe(new Date(200).toISOString());
    expect(
      (await loadReportScope(db, 'app', new URLSearchParams('manifest=error-only'))).problem
    ).toBeNull();
    expect((await loadReportScope(db, 'empty', new URLSearchParams())).manifests).toEqual([]);
  } finally {
    client.close();
  }
});
