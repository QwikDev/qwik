import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from 'vitest';
import { getInsightsFunctions, redactDbUrl, sumBuckets } from './index';

test('sumBuckets totals only the prefixed histogram columns', () => {
  const row = {
    from: 'a',
    to: 'b',
    interaction: 1,
    delay_count_00: 3,
    delay_count_01: 0,
    delay_count_02: 5,
    latency_count_00: 99,
  };
  expect(sumBuckets(row, 'delay_count_')).toBe(8);
  expect(sumBuckets(row, 'latency_count_')).toBe(99);
  expect(sumBuckets(row, 'timeline_')).toBe(0);
});

test('sumBuckets coerces bigint/string counts and ignores non-numeric', () => {
  const row = { delay_count_00: 2n, delay_count_01: '4', delay_count_02: null };
  expect(sumBuckets(row as any, 'delay_count_')).toBe(6);
});

test('redactDbUrl hides turso auth tokens', () => {
  expect(redactDbUrl('libsql://db.turso.io?authToken=secret123')).toBe(
    'libsql://db.turso.io?authToken=***'
  );
  expect(redactDbUrl('file:./.qwik/insights.db')).toBe('file:./.qwik/insights.db');
});

function withEnv(url: string | undefined, fn: () => Promise<void>) {
  const prev = process.env.QWIK_INSIGHTS_DB_URL;
  if (url === undefined) {
    delete process.env.QWIK_INSIGHTS_DB_URL;
  } else {
    process.env.QWIK_INSIGHTS_DB_URL = url;
  }
  return fn().finally(() => {
    if (prev === undefined) {
      delete process.env.QWIK_INSIGHTS_DB_URL;
    } else {
      process.env.QWIK_INSIGHTS_DB_URL = prev;
    }
  });
}

test('getInsightsData reads apps and ranks edges/routes from a local libSQL file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qwik-insights-'));
  mkdirSync(join(root, '.qwik'));
  const db = new DatabaseSync(join(root, '.qwik', 'insights.db'));
  db.exec(`CREATE TABLE applications (name TEXT, public_api_key TEXT, url TEXT);`);
  db.exec(
    `CREATE TABLE edges ("from" TEXT, "to" TEXT, interaction INTEGER, delay_count_00 INTEGER, delay_count_01 INTEGER);`
  );
  db.exec(
    `CREATE TABLE routes (route TEXT, symbol TEXT, timeline_00 INTEGER, timeline_01 INTEGER);`
  );
  db.exec(`INSERT INTO applications VALUES ('My App', 'key123', 'https://x.dev');`);
  db.exec(`INSERT INTO edges VALUES ('a','b',1,2,3), (NULL,'c',0,10,0);`);
  db.exec(`INSERT INTO routes VALUES ('/','sym1',1,1), ('/about','sym2',5,0);`);
  db.close();

  await withEnv(undefined, async () => {
    const { getInsightsData } = getInsightsFunctions({ config: { root } } as any);
    const data = await getInsightsData();

    expect(data.error).toBeUndefined();
    expect(data.apps).toEqual([{ name: 'My App', publicApiKey: 'key123', url: 'https://x.dev' }]);
    // ranked by summed delay buckets desc: (root)->c = 10, a->b = 5
    expect(data.edges).toEqual([
      { from: null, to: 'c', interaction: false, count: 10 },
      { from: 'a', to: 'b', interaction: true, count: 5 },
    ]);
    // ranked by summed timeline desc: /about->sym2 = 5 before /->sym1 = 2
    expect(data.routes[0]).toEqual({ route: '/about', symbol: 'sym2', count: 5 });
  });
});

test('getInsightsData tolerates a missing table', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qwik-insights-'));
  mkdirSync(join(root, '.qwik'));
  const db = new DatabaseSync(join(root, '.qwik', 'insights.db'));
  db.exec(`CREATE TABLE applications (name TEXT, public_api_key TEXT, url TEXT);`);
  db.exec(`INSERT INTO applications VALUES ('Solo', 'k', NULL);`);
  db.close();

  await withEnv(undefined, async () => {
    const { getInsightsData } = getInsightsFunctions({ config: { root } } as any);
    const data = await getInsightsData();
    expect(data.error).toBeUndefined();
    expect(data.apps).toHaveLength(1);
    expect(data.edges).toEqual([]); // edges table absent → empty, not an error
    expect(data.routes).toEqual([]);
  });
});

test('getInsightsData attempts remote Turso URLs and redacts the token', async () => {
  // Unreachable host → the remote read is attempted (not rejected) and fails gracefully.
  await withEnv('libsql://nonexistent.invalid?authToken=secret', async () => {
    const { getInsightsData } = getInsightsFunctions({ config: { root: '/tmp' } } as any);
    const data = await getInsightsData();
    expect(data.configured).toBe(true);
    expect(data.dbUrl).toContain('authToken=***');
    expect(data.edges).toEqual([]); // connection failed → caught → empty, no throw
  });
});
