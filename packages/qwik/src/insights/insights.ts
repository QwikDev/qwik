import { component$, isDev, sync$ } from '@qwik.dev/core';
import { jsx } from '@qwik.dev/core/jsx-runtime';

/** @public */
export interface InsightsPayload {
  /** Qwik version */
  qVersion: string;

  /** Manifest Hash of the container. */
  manifestHash: string;

  /**
   * API key of the application which we are trying to profile.
   *
   * This key can be used for sharding the data.
   */
  publicApiKey: string;

  /**
   * Previous symbol received on the client.
   *
   * Client periodically sends symbol log to the server. Being able to connect the order of symbols
   * is useful for server clustering. Sending previous symbol name allows the server to stitch the
   * symbol list together.
   */
  previousSymbol?: string | null;

  /** List of symbols which have been received since last update. */
  symbols: InsightSymbol[];
}

/** @public */
export interface InsightSymbol {
  /** Symbol name */
  symbol: string;

  /** Current route so we can have a better understanding of which symbols are needed for each route. */
  route: string;

  /** Time delta since last symbol. Can be used to stich symbol requests together */
  delay: number;

  /** Number of ms between the time the symbol was requested and it was loaded. */
  latency: number;

  /** Number of ms between the q:route attribute change and the qsymbol event */
  timeline: number;

  /**
   * Was this symbol as a result of user interaction. User interactions represent roots for
   * clouters.
   */
  interaction: boolean;
}

/** @public */
export interface InsightsError {
  /** Manifest Hash of the container. */
  manifestHash: string;
  timestamp: number;
  url: string;
  source: string;
  line: number;
  column: number;
  error: string;
  message: string;
  stack: string;
}

interface QSymbolDetail {
  element: HTMLElement | undefined;
  reqTime: number;
  symbol: string;
}

// Injected as window globals by the inline <Insights> script (sync$ code isn't replaced by the vite plugin)
// eslint-disable-next-line no-var
declare var __QI_KEY__: string;
// eslint-disable-next-line no-var
declare var __QI_URL__: string;
// eslint-disable-next-line no-var
declare var __QI_SAMPLE__: number;
// eslint-disable-next-line no-var
declare var __QI_PINGER__: string;

/**
 * Tiny gate emitted inline on every insights-enabled page. It samples the session, buffers
 * `qsymbol` activations, then lazily imports the pinger chunk to drain them and take over. Only the
 * sampled fraction downloads the pinger; everyone else runs just this gate.
 *
 * We use a self-invoking function to minify the code, renaming long globals and attributes; the
 * qwik optimizer only minifies somewhat, so put all var declarations in the same line.
 *
 * @internal
 */
export const insightsGate = sync$(() =>
  ((w: any, d: Document, p: Performance) => {
    /* eslint-disable no-var -- better minification */
    if (Math.random() >= __QI_SAMPLE__) {
      return;
    }
    var qRouteEl = d.querySelector(`[q\\:route]`),
      base = d.querySelector(`[q\\:base]`)?.getAttribute(`q:base`) || '/build/',
      queue: any[] = [],
      tracker: any = (w.qSymbolTracker = {
        symbols: [],
        publicApiKey: __QI_KEY__,
        q: queue,
        c: { u: __QI_URL__ },
        t0: p.now(),
      });
    d.addEventListener(`qsymbol`, (_event) => {
      var detail = (_event as CustomEvent<QSymbolDetail>).detail;
      queue.push({
        symbol: detail.symbol,
        reqTime: detail.reqTime,
        deliveredTime: _event.timeStamp,
        interaction: !!detail.element,
        route: qRouteEl?.getAttribute(`q:route`) || '/',
      });
      tracker.f && tracker.f();
    });
    import(/* @vite-ignore */ base + __QI_PINGER__);
  })(window, document, performance)
);

/**
 * @beta
 * @experimental
 */
export const Insights = component$(() => {
  if (!__EXPERIMENTAL__.insights) {
    throw new Error(
      'Insights is experimental and must be enabled with `experimental: ["insights"]` in the `qwikVite` plugin.'
    );
  }
  const key = (globalThis as any).__QI_KEY__;
  const url = (globalThis as any).__QI_URL__;
  const sample = (globalThis as any).__QI_SAMPLE__ ?? 0.05;
  const pinger = (globalThis as any).__QI_PINGER__;
  if (!key || !url || !pinger) {
    if (!isDev) {
      console.warn('<Insights />: no config from qwikInsights plugin, skipping...');
    }
    return null;
  }
  return /* @__PURE__ */ jsx('script', {
    'document:onQInit$': insightsGate,
    // We must pass the vite injected variables via window because sync$ code doesn't get replaced by the vite plugin
    dangerouslySetInnerHTML: `__QI_KEY__=${JSON.stringify(key)};__QI_URL__=${JSON.stringify(url)};__QI_SAMPLE__=${sample};__QI_PINGER__=${JSON.stringify(pinger)}`,
  });
});
