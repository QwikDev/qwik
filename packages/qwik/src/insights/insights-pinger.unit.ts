import { expect, test } from 'vitest';
import { drainQueue, type RawInsightSymbol } from './insights-pinger';
import type { InsightSymbol } from './insights';

const makeState = () => ({
  existing: new Set<string>(),
  symbols: [] as InsightSymbol[],
  lastReqTime: 0,
  routeChangeTime: 0,
});

const raw = (symbol: string, reqTime: number, deliveredTime: number): RawInsightSymbol => ({
  symbol,
  reqTime,
  deliveredTime,
  interaction: false,
  route: '/',
});

test('drains buffered activations with delay/latency/timeline', () => {
  const state = makeState();
  const queue = [raw('a', 100, 150), raw('b', 200, 260)];

  const added = drainQueue(state, queue, 0);

  expect(added).toBe(2);
  expect(state.symbols).toEqual([
    { symbol: 'a', route: '/', delay: 100, latency: 50, timeline: 100, interaction: false },
    { symbol: 'b', route: '/', delay: 50, latency: 60, timeline: 200, interaction: false },
  ]);
});

test('symbols buffered before the pinger loads are not lost', () => {
  // Gate buffered two symbols, pinger loads and drains from the start.
  const state = makeState();
  const queue = [raw('early1', 10, 20), raw('early2', 30, 45)];

  drainQueue(state, queue, 0);

  expect(state.symbols.map((s) => s.symbol)).toEqual(['early1', 'early2']);
});

test('dedupes by symbol across incremental drains', () => {
  const state = makeState();
  const queue = [raw('a', 100, 150)];
  drainQueue(state, queue, 0);

  // New activations arrive; a duplicate 'a' must be ignored.
  queue.push(raw('a', 300, 320), raw('c', 400, 420));
  const added = drainQueue(state, queue, 1);

  expect(added).toBe(1);
  expect(state.symbols.map((s) => s.symbol)).toEqual(['a', 'c']);
});

test('preserves interaction flag and route', () => {
  const state = makeState();
  const queue: RawInsightSymbol[] = [
    { symbol: 'x', reqTime: 5, deliveredTime: 9, interaction: true, route: '/dash' },
  ];
  drainQueue(state, queue, 0);

  expect(state.symbols[0]).toMatchObject({ interaction: true, route: '/dash' });
});
