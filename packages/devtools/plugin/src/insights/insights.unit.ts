import { writeInsights } from '@qwik.dev/core/insights/collector';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from 'vitest';
import { getInsightsFunctions } from './index';

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

const beacon = (publicApiKey: string, manifestHash: string, symbols: string[]) => ({
  qVersion: '2',
  manifestHash,
  publicApiKey,
  previousSymbol: null,
  symbols: symbols.map((symbol, i) => ({
    symbol,
    route: '/',
    delay: 5,
    latency: 5,
    timeline: 5,
    interaction: i === 0,
  })),
});

const tmpRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'qwik-insights-'));
  mkdirSync(join(root, '.qwik'));
  return root;
};

test('getInsightsData merges edges across builds and ranks them per app', async () => {
  const root = tmpRoot();
  const dbUrl = `file:${join(root, '.qwik', 'insights.db')}`;
  // Same edges recorded under two builds of app one, plus one session of app two.
  await writeInsights(dbUrl, beacon('appone123', 'build-1', ['s_a', 's_b']));
  await writeInsights(dbUrl, beacon('appone123', 'build-2', ['s_a', 's_b']));
  await writeInsights(dbUrl, beacon('apptwo123', 'build-1', ['s_c']));

  await withEnv(undefined, async () => {
    const { getInsightsData } = getInsightsFunctions({ config: { root } } as any);
    const data = await getInsightsData();

    expect(data.error).toBeUndefined();
    expect(data.apps.map((app) => app.publicApiKey).sort()).toEqual(['appone123', 'apptwo123']);
    expect(data.edges).toEqual([
      { publicApiKey: 'appone123', from: null, to: 'a', interaction: true, count: 2 },
      { publicApiKey: 'appone123', from: 'a', to: 'b', interaction: false, count: 2 },
      { publicApiKey: 'apptwo123', from: null, to: 'c', interaction: true, count: 1 },
    ]);
    expect(data.routes[0]).toEqual({
      publicApiKey: 'appone123',
      route: '/',
      symbol: 'a',
      count: 2,
    });
  });
});

test('getInsightsData tolerates a missing table', async () => {
  const root = tmpRoot();
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
    expect(data.error ?? '').not.toContain('secret');
    expect(data.edges).toEqual([]); // connection failed → caught → empty, no throw
  });
});
