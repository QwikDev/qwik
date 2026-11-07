import { existsSync, mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { writeInsights } from '../collector';
import type { InsightsPayload } from '../insights';
import { computeInsightsStrategy } from './strategy';

const KEY = 'key12345';
const sym = (symbol: string, delay: number) => ({
  symbol,
  route: '/',
  delay,
  latency: 10,
  timeline: 100,
  interaction: false,
});
const payload = (symbols: InsightsPayload['symbols'], manifestHash = 'mh1'): InsightsPayload => ({
  qVersion: '2',
  manifestHash,
  publicApiKey: KEY,
  previousSymbol: null,
  symbols,
});

test('computeInsightsStrategy derives prefetch and clusters correlated symbols', async () => {
  const dbUrl = `file:${join(mkdtempSync(join(tmpdir(), 'qwik-strategy-')), 'insights.db')}`;
  // Two sessions where bbb reliably follows aaa quickly (< 250ms) → correlated.
  await writeInsights(dbUrl, payload([sym('chunk_aaa', 5), sym('chunk_bbb', 5)]));
  await writeInsights(dbUrl, payload([sym('chunk_aaa', 5), sym('chunk_bbb', 5)]));

  const strategy = (await computeInsightsStrategy(dbUrl, KEY))!;

  // prefetch: route "/" lists the symbols seen on it.
  const rootRoute = strategy.prefetch.find((p) => p.route === '/');
  expect(rootRoute?.symbols.sort()).toEqual(['aaa', 'bbb']);

  // manual: every symbol is assigned, and the two correlated ones share a bundle.
  expect(Object.keys(strategy.manual).sort()).toEqual(['aaa', 'bbb']);
  expect(strategy.manual.aaa).toBe(strategy.manual.bbb);
});

const tmpDbUrl = () => `file:${join(mkdtempSync(join(tmpdir(), 'qwik-strategy-')), 'insights.db')}`;

test('route prefetch lists the most frequently used symbols first', async () => {
  const dbUrl = tmpDbUrl();
  await writeInsights(dbUrl, payload([sym('chunk_aaa', 5), sym('chunk_ccc', 5)]));
  await writeInsights(dbUrl, payload([sym('chunk_ccc', 5)]));
  await writeInsights(dbUrl, payload([sym('chunk_ccc', 5)]));

  const strategy = (await computeInsightsStrategy(dbUrl, KEY))!;

  expect(strategy.prefetch).toEqual([{ route: '/', symbols: ['ccc', 'aaa'] }]);
});

test('only the latest 100 builds feed the strategy', async () => {
  const dbUrl = tmpDbUrl();
  let now = 1_000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now++);
  try {
    await writeInsights(dbUrl, payload([sym('chunk_stale', 5)], 'old-build'));
    for (let i = 0; i < 100; i++) {
      await writeInsights(dbUrl, payload([sym('chunk_fresh', 5)], `build-${i}`));
    }
  } finally {
    clock.mockRestore();
  }

  const strategy = (await computeInsightsStrategy(dbUrl, KEY))!;

  expect(Object.keys(strategy.manual)).toEqual(['fresh']);
  expect(strategy.prefetch).toEqual([{ route: '/', symbols: ['fresh'] }]);
});

test('a DB nothing was collected into yet yields no strategy and no new file', async () => {
  const dbUrl = tmpDbUrl();
  expect(await computeInsightsStrategy(dbUrl, KEY)).toBeNull();
  expect(existsSync(dbUrl.replace(/^file:/, ''))).toBe(false);

  // An existing but empty DB (e.g. created by another tool) is also "no data yet".
  new DatabaseSync(dbUrl.replace(/^file:/, '')).close();
  expect(await computeInsightsStrategy(dbUrl, KEY)).toBeNull();
});
