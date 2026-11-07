import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, vi } from 'vitest';
import { handleInsightsBeacon, writeInsights } from './collector';
import type { InsightsPayload } from './insights';

const tmpDbUrl = () =>
  `file:${join(mkdtempSync(join(tmpdir(), 'qwik-collector-')), 'insights.db')}`;
const openRead = (dbUrl: string) =>
  new DatabaseSync(dbUrl.replace(/^file:/, ''), { readOnly: true });
const sumPrefix = (row: any, prefix: string) =>
  Object.keys(row)
    .filter((k) => k.startsWith(prefix))
    .reduce((total, k) => total + Number(row[k] || 0), 0);

const payload = (over: Partial<InsightsPayload> = {}): InsightsPayload => ({
  qVersion: '2',
  manifestHash: 'mh1',
  publicApiKey: 'key12345',
  previousSymbol: null,
  symbols: [
    { symbol: 'chunk_aaa', route: '/', delay: 5, latency: 20, timeline: 100, interaction: false },
    { symbol: 'chunk_bbb', route: '/', delay: 3, latency: 10, timeline: 50, interaction: true },
  ],
  ...over,
});

test('writeInsights creates the schema and records app, edges and routes', async () => {
  const dbUrl = tmpDbUrl();
  await writeInsights(dbUrl, payload());

  const db = openRead(dbUrl);
  expect(db.prepare('SELECT * FROM applications').all()).toEqual([
    { name: 'key12345', public_api_key: 'key12345', url: null },
  ]);

  // Symbols are cleaned (prefix before last `_`) and stitched root → aaa → bbb.
  expect(db.prepare('SELECT "from", "to", interaction FROM edges ORDER BY "to"').all()).toEqual([
    { from: null, to: 'aaa', interaction: 0 },
    { from: 'aaa', to: 'bbb', interaction: 1 },
  ]);

  // Each edge got exactly one delay + one latency bucket incremented.
  const edgeRows = db.prepare('SELECT * FROM edges').all() as any[];
  for (let i = 0; i < edgeRows.length; i++) {
    const row = edgeRows[i];
    expect(sumPrefix(row, 'delay_count_')).toBe(1);
    expect(sumPrefix(row, 'latency_count_')).toBe(1);
  }

  expect(db.prepare('SELECT route, symbol FROM routes ORDER BY symbol').all()).toEqual([
    { route: '/', symbol: 'aaa' },
    { route: '/', symbol: 'bbb' },
  ]);
  db.close();
});

test('writeInsights accumulates counts across beacons without duplicating edges', async () => {
  const dbUrl = tmpDbUrl();
  await writeInsights(dbUrl, payload());
  await writeInsights(dbUrl, payload());

  const db = openRead(dbUrl);
  expect((db.prepare('SELECT COUNT(*) c FROM edges').get() as any).c).toBe(2);
  const rootEdge = db.prepare('SELECT * FROM edges WHERE "from" IS NULL AND "to" = ?').get('aaa');
  expect(sumPrefix(rootEdge, 'delay_count_')).toBe(2);
  db.close();
});

test('concurrent beacons accumulate into one row per edge and route', async () => {
  const dbUrl = tmpDbUrl();
  await Promise.all(Array.from({ length: 20 }, () => writeInsights(dbUrl, payload())));

  const db = openRead(dbUrl);
  expect((db.prepare('SELECT COUNT(*) c FROM edges').get() as any).c).toBe(2);
  expect((db.prepare('SELECT COUNT(*) c FROM routes').get() as any).c).toBe(2);
  const rootEdge = db.prepare('SELECT * FROM edges WHERE "from" IS NULL AND "to" = ?').get('aaa');
  expect(sumPrefix(rootEdge, 'delay_count_')).toBe(20);
  db.close();
});

test('writeInsights ignores hW symbols but still records the app', async () => {
  const dbUrl = tmpDbUrl();
  await writeInsights(
    dbUrl,
    payload({
      symbols: [
        { symbol: 'x_hW', route: '/', delay: 1, latency: 1, timeline: 1, interaction: false },
      ],
    })
  );
  const db = openRead(dbUrl);
  expect((db.prepare('SELECT COUNT(*) c FROM edges').get() as any).c).toBe(0);
  expect((db.prepare('SELECT COUNT(*) c FROM applications').get() as any).c).toBe(1);
  db.close();
});

test('writeInsights skips beacons with an unusably short public key (no DB created)', async () => {
  const dbUrl = tmpDbUrl();
  await writeInsights(dbUrl, payload({ publicApiKey: 'abc' }));
  expect(existsSync(dbUrl.replace(/^file:/, ''))).toBe(false);
});

const beaconRequest = (body: unknown = payload()) =>
  new Request('http://app/insights', { method: 'POST', body: JSON.stringify(body) });

test('handleInsightsBeacon records a POST body into the DB', async () => {
  const dbUrl = tmpDbUrl();
  expect(await handleInsightsBeacon(beaconRequest(), { dbUrl })).toBe(true);

  const db = openRead(dbUrl);
  expect((db.prepare('SELECT COUNT(*) c FROM edges').get() as any).c).toBe(2);
  db.close();
});

test('handleInsightsBeacon swallows a malformed body without throwing', async () => {
  const dbUrl = tmpDbUrl();
  const request = new Request('http://app/insights', { method: 'POST', body: 'not-json' });
  await expect(handleInsightsBeacon(request, { dbUrl })).resolves.toBe(false);
  expect(existsSync(dbUrl.replace(/^file:/, ''))).toBe(false);
});

test('handleInsightsBeacon creates a missing DB directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qwik-collector-'));
  const dbUrl = `file:${join(dir, '.qwik', 'nested', 'insights.db')}`;
  expect(await handleInsightsBeacon(beaconRequest(), { dbUrl })).toBe(true);
  expect(existsSync(join(dir, '.qwik', 'nested', 'insights.db'))).toBe(true);
});

test('handleInsightsBeacon retries a DB that failed to open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qwik-collector-'));
  const blocker = join(dir, 'blocked');
  // A file where the DB directory should be makes the first open fail.
  writeFileSync(blocker, '');
  const dbUrl = `file:${join(blocker, 'insights.db')}`;
  expect(await handleInsightsBeacon(beaconRequest(), { dbUrl })).toBe(false);

  rmSync(blocker);
  expect(await handleInsightsBeacon(beaconRequest(), { dbUrl })).toBe(true);
});

test.each<[string, unknown]>([
  ['a NaN delay', { symbols: [{ ...payload().symbols[0], delay: 'abc' }] }],
  ['a missing manifestHash', { manifestHash: undefined }],
  ['an oversized route', { symbols: [{ ...payload().symbols[0], route: 'x'.repeat(2000) }] }],
  ['too many symbols', { symbols: Array.from({ length: 1001 }, () => payload().symbols[0]) }],
  ['a non-array symbols', { symbols: 'nope' }],
])('writeInsights rejects a beacon with %s', async (_name, override) => {
  const dbUrl = tmpDbUrl();
  expect(await writeInsights(dbUrl, { ...payload(), ...(override as object) })).toBe(false);
  expect(existsSync(dbUrl.replace(/^file:/, ''))).toBe(false);
});

test('handleInsightsBeacon only accepts the configured public API key', async () => {
  const dbUrl = tmpDbUrl();
  const publicApiKey = 'key12345';
  expect(
    await handleInsightsBeacon(beaconRequest({ ...payload(), publicApiKey: 'other123' }), {
      dbUrl,
      publicApiKey,
    })
  ).toBe(false);
  expect(await handleInsightsBeacon(beaconRequest(), { dbUrl, publicApiKey })).toBe(true);
});

test('handleInsightsBeacon rejects an oversized body', async () => {
  const dbUrl = tmpDbUrl();
  const body = JSON.stringify({ ...payload(), padding: 'x'.repeat(300 * 1024) });
  const request = new Request('http://app/insights', { method: 'POST', body });
  expect(await handleInsightsBeacon(request, { dbUrl })).toBe(false);
});

test('handleInsightsBeacon records error beacons posted to `error/`', async () => {
  const dbUrl = tmpDbUrl();
  const error = {
    url: 'http://app/page',
    manifestHash: 'mh1',
    timestamp: 1700000000000,
    source: 'http://app/build/q-abc.js',
    line: 3,
    column: 7,
    message: 'Uncaught Error: boom',
    error: 'boom',
    stack: 'x'.repeat(20000),
  };
  const request = new Request('http://app/insights/error/', {
    method: 'POST',
    body: JSON.stringify(error),
  });
  expect(await handleInsightsBeacon(request, { dbUrl, publicApiKey: 'key12345' })).toBe(true);

  const db = openRead(dbUrl);
  const row = db.prepare('SELECT * FROM errors').get() as any;
  expect(row).toMatchObject({
    public_api_key: 'key12345',
    manifest_hash: 'mh1',
    message: 'Uncaught Error: boom',
    line: 3,
  });
  expect(row.stack.length).toBe(8192);
  expect((db.prepare('SELECT COUNT(*) c FROM edges').get() as any).c).toBe(0);
  db.close();
});

test('handleInsightsBeacon stops reading a chunked body past the size limit', async () => {
  const dbUrl = tmpDbUrl();
  let chunksPulled = 0;
  // No content-length: an endless stream of 64 KiB chunks.
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunksPulled++;
      controller.enqueue(new Uint8Array(64 * 1024).fill(32));
    },
  });
  const request = new Request('http://app/insights', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  expect(await handleInsightsBeacon(request, { dbUrl })).toBe(false);
  expect(chunksPulled).toBeLessThan(10);
});

test('a failed schema setup closes the adapter before the next retry', async () => {
  vi.resetModules();
  const closed: string[] = [];
  vi.doMock('./db', async (importOriginal) => {
    const real = await importOriginal<typeof import('./db')>();
    return {
      ...real,
      openInsightsDb: async (url: string) => ({
        exec: async () => {
          throw new Error('schema failed');
        },
        batch: async () => {},
        all: async () => [],
        close: () => closed.push(url),
      }),
    };
  });
  try {
    const collector = await import('./collector');
    await expect(collector.writeInsights(tmpDbUrl(), payload())).rejects.toThrow('schema failed');
  } finally {
    vi.doUnmock('./db');
    vi.resetModules();
  }
  expect(closed).toHaveLength(1);
});

test('an edge stays marked interactive once any beacon saw it interactive', async () => {
  const dbUrl = tmpDbUrl();
  const sym = (interaction: boolean) => ({
    symbol: 'chunk_aaa',
    route: '/',
    delay: 5,
    latency: 5,
    timeline: 5,
    interaction,
  });
  await writeInsights(dbUrl, payload({ symbols: [sym(false)] }));
  await writeInsights(dbUrl, payload({ symbols: [sym(true)] }));
  await writeInsights(dbUrl, payload({ symbols: [sym(false)] }));

  const db = openRead(dbUrl);
  expect(db.prepare('SELECT interaction FROM edges').all()).toEqual([{ interaction: 1 }]);
  db.close();
});
