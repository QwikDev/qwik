import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { assert, test } from 'vitest';
import type { AppDatabase } from '.';

test('returns aggregated symbol graph counts', async () => {
  (globalThis as any).__EXPERIMENTAL__ = {};
  const { getSlowEdges, getSymbolGraphEdges } = await import('./query');
  const client = createClient({ url: 'file::memory:' });
  const delayColumns = Array.from(
    { length: 50 },
    (_, index) => `delay_count_${String(index).padStart(2, '0')} INTEGER NOT NULL DEFAULT 0`
  ).join(',');

  try {
    await client.execute(
      `CREATE TABLE edges (public_api_key TEXT NOT NULL, manifest_hash TEXT NOT NULL, "from" TEXT, "to" TEXT NOT NULL, ${delayColumns})`
    );
    await client.batch([
      {
        sql: 'INSERT INTO edges (public_api_key, manifest_hash, "from", "to", delay_count_00, delay_count_25) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['app', 'hash-a', 'parent', 'child', 2, 3],
      },
      {
        sql: 'INSERT INTO edges (public_api_key, manifest_hash, "from", "to", delay_count_00, delay_count_25) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['app', 'hash-b', 'parent', 'child', 5, 7],
      },
      {
        sql: 'INSERT INTO edges (public_api_key, manifest_hash, "from", "to", delay_count_00, delay_count_25) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['other-app', 'hash-a', 'parent', 'child', 100, 100],
      },
    ]);

    const db = drizzle(client) as AppDatabase;
    assert.deepEqual(
      await getSymbolGraphEdges(db, 'app', { manifestHashes: ['hash-a', 'hash-b'] }),
      [
        {
          from: 'parent',
          to: 'child',
          relatedCount: 7,
          unrelatedCount: 10,
        },
      ]
    );
    assert.deepEqual(await getSlowEdges(db, 'app', []), []);
  } finally {
    client.close();
  }
});
