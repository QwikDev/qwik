import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { assert, test } from 'vitest';
import type { AppDatabase } from '.';
import { manifestTable } from './schema';
import { dbGetManifestHashes, dbGetManifestStats } from './sql-manifest';

test('returns the 100 newest manifest hashes', async () => {
  const client = createClient({ url: 'file::memory:' });
  const latencyColumns = Array.from(
    { length: 50 },
    (_, index) => `latency_count_${String(index).padStart(2, '0')} INTEGER NOT NULL DEFAULT 0`
  ).join(',');

  try {
    await client.execute(
      'CREATE TABLE manifests (id INTEGER PRIMARY KEY, public_api_key TEXT NOT NULL, hash TEXT NOT NULL, timestamp INTEGER NOT NULL)'
    );
    await client.execute(
      `CREATE TABLE edges (public_api_key TEXT NOT NULL, manifest_hash TEXT NOT NULL, ${latencyColumns})`
    );

    const db = drizzle(client) as AppDatabase;
    const manifests = Array.from({ length: 125 }, (_, index) => ({
      publicApiKey: 'app',
      hash: `hash-${index}`,
      timestamp: new Date(index),
    }));
    await db.insert(manifestTable).values(manifests).run();
    await client.batch(
      manifests.map(({ publicApiKey, hash }) => ({
        sql: 'INSERT INTO edges (public_api_key, manifest_hash) VALUES (?, ?)',
        args: [publicApiKey, hash],
      }))
    );
    await client.execute({
      sql: 'INSERT INTO edges (public_api_key, manifest_hash, latency_count_00) VALUES (?, ?, ?)',
      args: ['other-app', 'hash-24', 10],
    });

    const expectedHashes = Array.from({ length: 100 }, (_, index) => `hash-${124 - index}`);
    assert.deepEqual(await dbGetManifestHashes(db, 'app'), expectedHashes);
    assert.deepEqual(
      await dbGetManifestHashes(db, 'app', { limit: 20, offset: 20 }),
      expectedHashes.slice(20, 40)
    );
    const stats = await dbGetManifestStats(db, 'app');
    assert.deepEqual(
      stats.map((manifest) => manifest.hash),
      expectedHashes
    );
    assert.equal(stats[0].latency[0], 0);
  } finally {
    client.close();
  }
});
