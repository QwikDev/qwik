import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { assert, test } from 'vitest';
import type { AppDatabase } from '.';
import { manifestTable } from './schema';
import { dbGetLatestManifests, dbGetManifestHashes, dbGetManifestStats } from './sql-manifest';

test('returns only the latest manifest for each application', async () => {
  const client = createClient({ url: 'file::memory:' });

  try {
    await client.execute(
      'CREATE TABLE manifests (id INTEGER PRIMARY KEY, public_api_key TEXT NOT NULL, hash TEXT NOT NULL, timestamp INTEGER NOT NULL)'
    );

    const db = drizzle(client) as AppDatabase;
    await db
      .insert(manifestTable)
      .values([
        {
          publicApiKey: 'app-a',
          hash: 'app-a-old',
          timestamp: new Date('2026-07-20T10:00:00.000Z'),
        },
        {
          publicApiKey: 'app-b',
          hash: 'app-b-latest',
          timestamp: new Date('2026-07-20T12:00:00.000Z'),
        },
        {
          publicApiKey: 'app-a',
          hash: 'app-a-latest',
          timestamp: new Date('2026-07-20T13:00:00.000Z'),
        },
        {
          publicApiKey: 'not-requested',
          hash: 'other-latest',
          timestamp: new Date('2026-07-20T14:00:00.000Z'),
        },
      ])
      .run();

    const manifests = await dbGetLatestManifests(db, ['app-a', 'app-b', 'app-empty']);

    assert.deepEqual(
      manifests.map(({ publicApiKey, hash }) => ({ publicApiKey, hash })),
      [
        { publicApiKey: 'app-a', hash: 'app-a-latest' },
        { publicApiKey: 'app-b', hash: 'app-b-latest' },
      ]
    );
    assert.deepEqual(await dbGetLatestManifests(db, []), []);
  } finally {
    client.close();
  }
});

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
    const limitedStats = await dbGetManifestStats(db, 'app', { limit: 2 });
    assert.deepEqual(
      limitedStats.map((manifest) => manifest.hash),
      expectedHashes.slice(0, 2)
    );
  } finally {
    client.close();
  }
});
