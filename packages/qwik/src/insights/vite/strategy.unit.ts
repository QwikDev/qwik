import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
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
const payload = (symbols: InsightsPayload['symbols']): InsightsPayload => ({
  qVersion: '2',
  manifestHash: 'mh1',
  publicApiKey: KEY,
  previousSymbol: null,
  symbols,
});

test('computeInsightsStrategy derives prefetch and clusters correlated symbols', async () => {
  const dbUrl = `file:${join(mkdtempSync(join(tmpdir(), 'qwik-strategy-')), 'insights.db')}`;
  // Two sessions where bbb reliably follows aaa quickly (< 250ms) → correlated.
  await writeInsights(dbUrl, payload([sym('chunk_aaa', 5), sym('chunk_bbb', 5)]));
  await writeInsights(dbUrl, payload([sym('chunk_aaa', 5), sym('chunk_bbb', 5)]));

  const strategy = await computeInsightsStrategy(dbUrl, KEY);

  // prefetch: route "/" lists the symbols seen on it.
  const rootRoute = strategy.prefetch.find((p) => p.route === '/');
  expect(rootRoute?.symbols.sort()).toEqual(['aaa', 'bbb']);

  // manual: every symbol is assigned, and the two correlated ones share a bundle.
  expect(Object.keys(strategy.manual).sort()).toEqual(['aaa', 'bbb']);
  expect(strategy.manual.aaa).toBe(strategy.manual.bbb);
});
