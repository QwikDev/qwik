import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from 'vitest';
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
