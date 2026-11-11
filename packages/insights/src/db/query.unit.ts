import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { assert, test } from 'vitest';
import type { AppDatabase } from '.';

test('returns every delay and latency bucket for the selected application and manifests', async () => {
  (globalThis as any).__EXPERIMENTAL__ = {};
  const { getEdges, getSymbolGraphEdges } = await import('./query');
  const { vectorSum2 } = await import('../stats/vector');
  const client = createClient({ url: 'file::memory:' });
  const counts = Array.from({ length: 50 }, (_, index) => index + 1);
  const columns = ['delay', 'latency'].flatMap((kind) =>
    counts.map((_, index) => `${kind}_count_${String(index).padStart(2, '0')}`)
  );

  try {
    await client.execute(
      `CREATE TABLE edges (public_api_key TEXT NOT NULL, manifest_hash TEXT NOT NULL, "from" TEXT, "to" TEXT NOT NULL, ${columns.map((column) => `${column} INTEGER NOT NULL`).join(',')})`
    );
    await client.batch(
      [
        ['app', 'current', null, 'child', ...counts, ...counts.map((count) => count * 10)],
        ['app', 'previous', null, 'child', ...counts, ...counts.map((count) => count * 20)],
        ['app', 'excluded', null, 'child', ...counts, ...counts],
        ['other-app', 'current', null, 'child', ...counts, ...counts],
        ['app', 'current', 'parent', 'child', ...counts.map(() => 0), ...counts.map(() => 0)],
      ].map((args) => ({
        sql: `INSERT INTO edges (public_api_key, manifest_hash, "from", "to", ${columns.join(',')}) VALUES (${args.map(() => '?').join(',')})`,
        args,
      }))
    );
    const db = drizzle(client) as AppDatabase;
    const options = { manifestHashes: ['current', 'previous'] };
    assert.deepEqual(await getEdges(db, 'app', options), [
      {
        from: null,
        to: 'child',
        delay: counts.map((count) => count * 2),
        latency: counts.map((count) => count * 30),
      },
      { from: 'parent', to: 'child', delay: counts.map(() => 0), latency: counts.map(() => 0) },
    ]);
    const histogramEdges = await getEdges(db, 'app', options);
    assert.deepEqual(
      await getSymbolGraphEdges(db, 'app', options),
      histogramEdges.map(({ from, to, delay }) => {
        const [relatedCount, unrelatedCount] = vectorSum2(delay, 250);
        return { from, to, relatedCount, unrelatedCount };
      })
    );
    assert.lengthOf(await getEdges(db, 'app', { ...options, limit: 1 }), 1);
    assert.deepEqual(await getEdges(db, 'missing-app', options), []);
    assert.deepEqual(await getEdges(db, 'app', { manifestHashes: ['missing-manifest'] }), []);
  } finally {
    client.close();
  }
});

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

test('keeps high-tail candidates beyond the first 400 mean-latency results', async () => {
  (globalThis as any).__EXPERIMENTAL__ = {};
  const { getSlowEdges } = await import('./query');
  const { getManifestPerformance } = await import('../routes/app/[publicApiKey]/performance');
  const client = createClient({ url: 'file::memory:' });
  const columns = Array.from(
    { length: 50 },
    (_, i) => `latency_count_${String(i).padStart(2, '0')} INTEGER NOT NULL DEFAULT 0`
  );
  try {
    await client.execute(
      `CREATE TABLE edges (public_api_key TEXT, manifest_hash TEXT, "to" TEXT, ${columns.join(',')})`
    );
    await client.batch(
      Array.from({ length: 400 }, (_, i) => ({
        sql: 'INSERT INTO edges (public_api_key, manifest_hash, "to", latency_count_34) VALUES (?, ?, ?, 100)',
        args: ['app', 'build', `steady-${i}`],
      }))
    );
    await client.execute(
      "INSERT INTO edges (public_api_key, manifest_hash, \"to\", latency_count_00, latency_count_49) VALUES ('app', 'build', 'tail', 94, 6)"
    );
    const candidates = await getSlowEdges(drizzle(client) as AppDatabase, 'app', ['build']);
    assert.isDefined(candidates.find((edge) => edge.to === 'tail'));
    assert.lengthOf(candidates, 401);
    const ranked = candidates
      .map((edge) => ({ ...edge, ...getManifestPerformance(edge.latency) }))
      .sort((a, b) => (b.p95 ?? -1) - (a.p95 ?? -1));
    assert.equal(ranked[0].to, 'tail');
    assert.deepEqual(await getSlowEdges(drizzle(client) as AppDatabase, 'other', ['build']), []);
  } finally {
    client.close();
  }
});
