import {
  libsqlInsightsDb,
  migrateInsightsDb,
  recordInsightsBeacon,
  recordInsightsError,
  recordInsightsSymbols,
} from '@qwik.dev/core/insights/collector';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import type { AppDatabase } from '.';

(globalThis as any).__EXPERIMENTAL__ = {};
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function withDb(fn: (client: Client, db: AppDatabase) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'insights-collector-'));
  const client = createClient({ url: `file:${join(dir, 'insights.db')}` });
  // As on the production database: the schema's foreign keys are not enforced.
  await client.execute('PRAGMA foreign_keys = OFF');
  try {
    await fn(client, drizzle({ client }));
  } finally {
    client.close();
  }
}

const beacon = (manifestHash: string) => ({
  qVersion: '2',
  publicApiKey: 'app12345',
  manifestHash,
  previousSymbol: null,
  symbols: [
    { symbol: 's_aaa', route: '/', delay: 5, latency: 20, timeline: 100, interaction: true },
    { symbol: 's_bbb', route: '/', delay: 3, latency: 10, timeline: 50, interaction: false },
  ],
});

test('the core collector and drizzle agree on which migrations are applied', async () => {
  await withDb(async (client, db) => {
    await migrateInsightsDb(libsqlInsightsDb(client));
    // Would fail re-creating tables if it disagreed with the collector's bookkeeping.
    await migrate(db, { migrationsFolder });
  });
  await withDb(async (client, db) => {
    await migrate(db, { migrationsFolder });
    await migrateInsightsDb(libsqlInsightsDb(client));
  });
});

test('dashboard reports read what the core collector records', async () => {
  await withDb(async (client, db) => {
    const insightsDb = libsqlInsightsDb(client);
    await migrateInsightsDb(insightsDb);
    await client.execute(
      `INSERT INTO applications (name, public_api_key) VALUES ('App', 'app12345')`
    );
    await recordInsightsSymbols(insightsDb, 'app12345', 'build1', [
      { hash: 'aaa', displayName: 'App_component', origin: 'src/app.tsx', loc: [1, 9] },
    ]);
    await Promise.all([
      recordInsightsBeacon(insightsDb, beacon('build1')),
      recordInsightsBeacon(insightsDb, beacon('build1')),
    ]);
    await recordInsightsError(insightsDb, {
      publicApiKey: 'app12345',
      manifestHash: 'build1',
      timestamp: 1,
      url: '/',
      source: 'app.js',
      line: 1,
      column: 2,
      message: 'boom',
      error: 'Error',
      stack: '',
    });

    const { getEdges, getSymbolDetails } = await import('./query');
    const { dbGetManifests } = await import('./sql-manifest');
    const { getRoutes } = await import('./sql-routes');
    expect((await dbGetManifests(db, 'app12345')).map(({ hash }) => hash)).toEqual(['build1']);
    const edges = await getEdges(db, 'app12345', { manifestHashes: ['build1'] });
    expect(
      edges.map(({ from, to, delay }) => ({ from, to, samples: delay.reduce((a, b) => a + b) }))
    ).toEqual([
      { from: null, to: 'aaa', samples: 2 },
      { from: 'aaa', to: 'bbb', samples: 2 },
    ]);
    expect(
      (await getRoutes(db, 'app12345', ['build1'])).map(({ symbol }) => symbol).sort()
    ).toEqual(['aaa', 'bbb']);
    expect(
      (await getSymbolDetails(db, 'app12345', { manifestHashes: ['build1'] })).map(
        ({ hash, fullName }) => ({ hash, fullName })
      )
    ).toEqual([{ hash: 'aaa', fullName: 'App_component' }]);
    expect((await client.execute('SELECT message FROM errors')).rows[0].message).toBe('boom');
  });
});

test('repeated and concurrent symbol uploads keep one updated row per app, build and symbol', async () => {
  await withDb(async (client) => {
    const insightsDb = libsqlInsightsDb(client);
    await migrateInsightsDb(insightsDb);
    const symbols = Array.from({ length: 1001 }, (_, i) => ({
      hash: `hash-${i}`,
      displayName: `Symbol ${i}`,
      origin: 'source.tsx',
      loc: [1, 2] as [number, number],
    }));
    await recordInsightsSymbols(insightsDb, 'app', 'build', symbols);
    symbols[1000].displayName = 'Updated tail';
    await Promise.all([
      recordInsightsSymbols(insightsDb, 'app', 'build', symbols),
      recordInsightsSymbols(insightsDb, 'app', 'build', symbols),
      recordInsightsSymbols(insightsDb, 'other', 'build', symbols.slice(1000)),
      recordInsightsSymbols(insightsDb, 'app', 'old', symbols.slice(1000)),
    ]);
    const rows = await client.execute(
      "SELECT hash, full_name FROM symbolDetail WHERE public_api_key='app' AND manifest_hash='build'"
    );
    expect(rows.rows).toHaveLength(1001);
    expect(rows.rows.find((row) => row.hash === 'hash-1000')?.full_name).toBe('Updated tail');
    expect((await client.execute('SELECT count(*) AS count FROM symbolDetail')).rows[0].count).toBe(
      1003
    );
    expect((await client.execute('SELECT count(*) AS count FROM manifests')).rows[0].count).toBe(3);
  });
});
