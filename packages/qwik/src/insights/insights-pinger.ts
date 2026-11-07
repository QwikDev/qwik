import type { InsightSymbol, InsightsError, InsightsPayload } from './insights';

/**
 * Raw symbol activation captured by the inline gate before this lazy chunk loaded. The gate keeps
 * these minimal; the pinger turns them into {@link InsightSymbol} entries with computed timings.
 */
export interface RawInsightSymbol {
  /** Symbol name from the `qsymbol` event detail. */
  symbol: string;
  /** `performance.now()` when the symbol was requested (event detail `reqTime`). */
  reqTime: number;
  /** Event `timeStamp` when the symbol was delivered. */
  deliveredTime: number;
  /** Whether the activation came from a user interaction. */
  interaction: boolean;
  /** `q:route` value at capture time. */
  route: string;
}

/** Shared state on `window.qSymbolTracker`, seeded by the inline gate and drained here. */
export interface QSymbolTrackerState {
  /** Processed activations, in flush order. Public for back-compat tooling. */
  symbols: InsightSymbol[];
  publicApiKey: string;
  /** Raw activations buffered by the gate (grows as more arrive). */
  q: RawInsightSymbol[];
  /** Config from the inline gate: `u` is the post URL. */
  c: { u: string };
  /** `performance.now()` at gate start — the initial-route baseline for `timeline`. */
  t0: number;
  /** Set by the pinger so the gate can notify it of new buffered symbols. */
  f?: () => void;
}

interface DrainState {
  existing: Set<string>;
  symbols: InsightSymbol[];
  lastReqTime: number;
  routeChangeTime: number;
}

/**
 * Turn buffered raw activations into {@link InsightSymbol} entries, deduping by symbol and computing
 * delay/latency/timeline exactly like the live path. Returns how many new entries were appended.
 *
 * Pure over `state` + `queue` so it is testable without a DOM.
 *
 * @internal
 */
export const drainQueue = (
  state: DrainState,
  queue: RawInsightSymbol[],
  fromIndex: number
): number => {
  const round = Math.round;
  let added = 0;
  for (let i = fromIndex; i < queue.length; i++) {
    const raw = queue[i];
    if (state.existing.has(raw.symbol)) {
      continue;
    }
    state.existing.add(raw.symbol);
    state.symbols.push({
      symbol: raw.symbol,
      route: raw.route,
      delay: round(raw.reqTime - state.lastReqTime),
      latency: round(raw.deliveredTime - raw.reqTime),
      timeline: round(raw.reqTime - state.routeChangeTime),
      interaction: raw.interaction,
    });
    state.lastReqTime = raw.deliveredTime;
    added++;
  }
  return added;
};

/**
 * Lazy insights tracker. The inline gate (see `insightsGate` in insights.ts) samples the session,
 * buffers `qsymbol` events, then imports this chunk to drain the buffer and take over live
 * tracking.
 */
export default function startInsights(): void {
  const w = window as unknown as Window & { qSymbolTracker: QSymbolTrackerState };
  const tracker = w.qSymbolTracker;
  const postUrl = tracker.c.u;
  const publicApiKey = tracker.publicApiKey;
  const qVersion = document.querySelector(`[q\\:version]`)?.getAttribute(`q:version`) || 'unknown';
  const manifestHash =
    document.querySelector(`[q\\:manifest-hash]`)?.getAttribute(`q:manifest-hash`) || 'dev';
  const qRouteEl = document.querySelector(`[q\\:route]`);

  // ponytail: buffered pre-load symbols use the page-load baseline for `timeline`; a sub-RTT SPA
  // route change before this chunk loads is not tracked precisely. Fine for a statistical model.
  const state: DrainState = {
    existing: new Set(),
    symbols: tracker.symbols,
    lastReqTime: 0,
    routeChangeTime: tracker.t0,
  };
  let rawIndex = 0;
  let flushIndex = 0;
  let timeoutID: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timeoutID = undefined;
    if (tracker.symbols.length > flushIndex) {
      const payload: InsightsPayload = {
        qVersion,
        publicApiKey,
        manifestHash,
        previousSymbol: flushIndex === 0 ? undefined : tracker.symbols[flushIndex - 1].symbol,
        symbols: tracker.symbols.slice(flushIndex),
      };
      navigator.sendBeacon(postUrl, JSON.stringify(payload));
      flushIndex = tracker.symbols.length;
    }
  };
  const debounceFlush = () => {
    timeoutID != undefined && clearTimeout(timeoutID);
    timeoutID = setTimeout(flush, 1000);
  };

  const process = () => {
    if (drainQueue(state, tracker.q, rawIndex) > 0) {
      rawIndex = tracker.q.length;
      debounceFlush();
    }
  };
  // Let the gate hand off future activations, then drain whatever it already buffered.
  tracker.f = process;

  if (qRouteEl) {
    new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === `q:route`)) {
        state.routeChangeTime = performance.now();
      }
    }).observe(qRouteEl, { attributes: true });
  }
  document.addEventListener(
    'visibilitychange',
    () => document.visibilityState === 'hidden' && flush()
  );
  window.addEventListener('error', (event: ErrorEvent) => {
    const error = event.error;
    if (!(error && typeof error === 'object')) {
      return;
    }
    const payload: InsightsError = {
      publicApiKey,
      url: `${location}`,
      manifestHash,
      timestamp: new Date().getTime(),
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      message: event.message,
      error: 'message' in error ? (error as Error).message : `${error}`,
      stack: 'stack' in error ? (error as Error).stack || '' : '',
    };
    navigator.sendBeacon(`${postUrl}error/`, JSON.stringify(payload));
  });

  process();
}

// Auto-run when loaded in a sampled session (the gate sets qSymbolTracker before importing us).
if (typeof window !== 'undefined' && (window as any).qSymbolTracker) {
  startInsights();
}
