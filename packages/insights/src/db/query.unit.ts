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

test('returns symbol details by hash across manifests', async () => {
  (globalThis as any).__EXPERIMENTAL__ = {};
  const { getSymbolDetailsByHashes } = await import('./query');
  const client = createClient({ url: 'file::memory:' });

  try {
    await client.execute(
      'CREATE TABLE symbolDetail (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, public_api_key TEXT, manifest_hash TEXT, full_name TEXT NOT NULL, origin TEXT NOT NULL, lo INTEGER NOT NULL, hi INTEGER NOT NULL)'
    );
    await client.batch([
      {
        sql: 'INSERT INTO symbolDetail (hash, public_api_key, manifest_hash, full_name, origin, lo, hi) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['symbol-a', 'app', 'old-manifest', 'Symbol A', 'a.tsx', 1, 2],
      },
      {
        sql: 'INSERT INTO symbolDetail (hash, public_api_key, manifest_hash, full_name, origin, lo, hi) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['symbol-b', 'app', 'old-manifest', 'Symbol B', 'b.tsx', 3, 4],
      },
      {
        sql: 'INSERT INTO symbolDetail (hash, public_api_key, manifest_hash, full_name, origin, lo, hi) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: ['symbol-a', 'other-app', 'old-manifest', 'Other Symbol', 'other.tsx', 5, 6],
      },
    ]);

    const db = drizzle(client) as AppDatabase;
    assert.deepEqual(await getSymbolDetailsByHashes(db, 'app', ['symbol-a']), [
      {
        hash: 'symbol-a',
        fullName: 'Symbol A',
        origin: 'a.tsx',
        lo: 1,
        hi: 2,
      },
    ]);
    assert.deepEqual(await getSymbolDetailsByHashes(db, 'app', []), []);
  } finally {
    client.close();
  }
});
