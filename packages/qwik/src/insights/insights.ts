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

interface QwikSymbolTrackerWindow extends Window {
  qSymbolTracker: {
    symbols: InsightSymbol[];
    publicApiKey: string;
  };
}

interface QSymbolDetail {
  element: HTMLElement | undefined;
  reqTime: number;
  symbol: string;
}

// Injected by the vite plugin
// eslint-disable-next-line no-var
declare var __QI_KEY__: string;
// eslint-disable-next-line no-var
declare var __QI_URL__: string;

// We use a self-invoking function to minify the code, renaming long globals and attributes
// the qwik optimizer only minifies somewhat, so put all var declarations in the same line
/** @internal */
export const insightsPing = sync$(() =>
  ((w: QwikSymbolTrackerWindow, d, l, n, p, r, S) => {
    /* eslint-disable no-var -- better minification */
    var publicApiKey = __QI_KEY__,
      postUrl = __QI_URL__,
      qVersion = d.querySelector(`[q\\:version]`)?.getAttribute(`q:version`) || 'unknown',
      manifestHash =
        d.querySelector(`[q\\:manifest-hash]`)?.getAttribute(`q:manifest-hash`) || 'dev',
      qSymbols: InsightSymbol[] = [],
      existingSymbols: Set<string> = new Set(),
      flushSymbolIndex: number = 0,
      lastReqTime: number = 0,
      timeoutID: ReturnType<typeof setTimeout> | undefined,
      qRouteChangeTime = p.now(),
      qRouteEl = d.querySelector(`[q\\:route]`),
      flush = () => {
        timeoutID = undefined;
        if (qSymbols.length > flushSymbolIndex) {
          var payload = {
            qVersion,
            publicApiKey,
            manifestHash,
            previousSymbol:
              flushSymbolIndex == 0 ? undefined : qSymbols[flushSymbolIndex - 1].symbol,
            symbols: qSymbols.slice(flushSymbolIndex),
          } satisfies InsightsPayload;
          n.sendBeacon(postUrl, S(payload));
          flushSymbolIndex = qSymbols.length;
        }
      },
      debounceFlush = () => {
        timeoutID != undefined && clearTimeout(timeoutID);
        timeoutID = setTimeout(flush, 1000);
      };

    w.qSymbolTracker = {
      symbols: qSymbols,
      publicApiKey,
    };
    if (qRouteEl) {
      new MutationObserver((mutations) => {
        var mutation = mutations.find((m) => m.attributeName === `q:route`);
        if (mutation) {
          qRouteChangeTime = p.now();
        }
      }).observe(qRouteEl, { attributes: true });
    }
    d.addEventListener('visibilitychange', () => d.visibilityState === 'hidden' && flush());
    d.addEventListener(`qsymbol`, (_event) => {
      var event = _event as CustomEvent<QSymbolDetail>,
        detail = event.detail,
        symbolRequestTime = detail.reqTime,
        symbolDeliveredTime = event.timeStamp,
        symbol = detail.symbol;
      if (!existingSymbols.has(symbol)) {
        existingSymbols.add(symbol);
        var route = qRouteEl?.getAttribute(`q:route`) || '/';
        qSymbols.push({
          symbol,
          route,
          delay: r(0 - lastReqTime + symbolRequestTime),
          latency: r(symbolDeliveredTime - symbolRequestTime),
          timeline: r(0 - qRouteChangeTime + symbolRequestTime),
          interaction: !!detail.element,
        });
        lastReqTime = symbolDeliveredTime;
        debounceFlush();
      }
    });
    w.addEventListener('error', (event: ErrorEvent) => {
      var error = event.error;
      if (!(error && typeof error === 'object')) {
        return;
      }
      var payload = {
        url: `${l}`,
        manifestHash,
        timestamp: new Date().getTime(),
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        message: event.message,
        error: 'message' in error ? (error as Error).message : `${error}`,
        stack: 'stack' in error ? (error as Error).stack || '' : '',
      } satisfies InsightsError;
      n.sendBeacon(`${postUrl}error/`, S(payload));
    });
  })(window as any, document, location, navigator, performance, Math.round, JSON.stringify)
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
  if (!key || !url) {
    if (!isDev) {
      console.warn('<Insights />: no config from qwikInsights plugin, skipping...');
    }
    return null;
  }
  return /* @__PURE__ */ jsx('script', {
    'document:onQInit$': insightsPing,
    // We must pass the vite injected variables via window because sync$ code doesn't get replaced by the vite plugin
    dangerouslySetInnerHTML: `__QI_KEY__=${JSON.stringify(key)};__QI_URL__=${JSON.stringify(url)}`,
  });
});
