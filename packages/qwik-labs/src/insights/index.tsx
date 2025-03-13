import { component$, sync$ } from '@builder.io/qwik';
import { z } from 'zod';

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

export const InsightsError = /* @__PURE__ */ z.object({
  manifestHash: z.string(),
  url: z.string(),
  timestamp: z.number(),
  source: z.string(),
  line: z.number(),
  column: z.number(),
  message: z.string(),
  error: z.string(),
  stack: z.string(),
});

export const InsightSymbol = /* @__PURE__ */ z.object({
  symbol: z.string(),
  route: z.string(),
  delay: z.number(),
  latency: z.number(),
  timeline: z.number(),
  interaction: z.boolean(),
});

export const InsightsPayload = /* @__PURE__ */ z.object({
  qVersion: z.string(),
  manifestHash: z.string(),
  publicApiKey: z.string(),
  // we retain nullable for older clients
  previousSymbol: z.string().optional().nullable(),
  symbols: z.array(InsightSymbol),
});

InsightSymbol._type satisfies InsightSymbol;
InsightsPayload._type satisfies InsightsPayload;
InsightsError._type satisfies InsightsError;

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

// We use a self-invoking function to minify the code, renaming long globals and attributes
// the qwik optimizer only minifies somewhat, so put all var declarations in the same line
const insightsPing = sync$(() =>
  ((
    window: QwikSymbolTrackerWindow,
    document,
    location,
    navigator,
    performance,
    round,
    JSON_stringify
  ) => {
    /* eslint-disable no-var -- better minification */
    var publicApiKey = __QI_KEY__,
      postUrl = __QI_URL__,
      getAttribute_s = 'getAttribute' as const,
      querySelector_s = 'querySelector' as const,
      manifest_s = 'manifest' as const,
      manifest_hash_s = `${manifest_s}-hash` as const,
      manifestHash_s = `${manifest_s}Hash` as const,
      version_s = 'version' as const,
      publicApiKey_s = 'publicApiKey' as const,
      sendBeacon_s = 'sendBeacon' as const,
      symbol_s = 'symbol' as const,
      length_s = 'length' as const,
      addEventListener_s = 'addEventListener' as const,
      route_s = 'route' as const,
      error_s = 'error' as const,
      stack_s = 'stack' as const,
      message_s = 'message' as const,
      symbols_s = `${symbol_s}s` as const,
      qVersion =
        document[querySelector_s](`[q\\:${version_s}]`)?.[getAttribute_s](`q:${version_s}`) ||
        'unknown',
      manifestHash =
        document[querySelector_s](`[q\\:${manifest_hash_s}]`)?.[getAttribute_s](
          `q:${manifest_hash_s}`
        ) || 'dev',
      qSymbols: InsightSymbol[] = [],
      existingSymbols: Set<string> = new Set(),
      flushSymbolIndex: number = 0,
      lastReqTime: number = 0,
      timeoutID: ReturnType<typeof setTimeout> | undefined,
      qRouteChangeTime = performance.now(),
      qRouteEl = document[querySelector_s](`[q\\:${route_s}]`),
      flush = () => {
        timeoutID = undefined;
        if (qSymbols[length_s] > flushSymbolIndex) {
          var payload = {
            qVersion,
            [publicApiKey_s]: publicApiKey,
            [manifestHash_s]: manifestHash,
            previousSymbol:
              flushSymbolIndex == 0 ? undefined : qSymbols[flushSymbolIndex - 1][symbol_s],
            [symbols_s]: qSymbols.slice(flushSymbolIndex),
          } satisfies InsightsPayload;
          navigator[sendBeacon_s](postUrl, JSON_stringify(payload));
          flushSymbolIndex = qSymbols[length_s];
        }
      },
      debounceFlush = () => {
        timeoutID != undefined && clearTimeout(timeoutID);
        timeoutID = setTimeout(flush, 1000);
      };

    window.qSymbolTracker = {
      [symbols_s]: qSymbols,
      [publicApiKey_s]: publicApiKey,
    };
    if (qRouteEl) {
      new MutationObserver((mutations) => {
        var mutation = mutations.find((m) => m.attributeName === `q:${route_s}`);
        if (mutation) {
          qRouteChangeTime = performance.now();
        }
      }).observe(qRouteEl, { attributes: true });
    }
    document[addEventListener_s](
      'visibilitychange',
      () => document.visibilityState === 'hidden' && flush()
    );
    document[addEventListener_s](`q${symbol_s}`, (_event) => {
      var event = _event as CustomEvent<QSymbolDetail>,
        detail = event.detail,
        symbolRequestTime = detail.reqTime,
        symbolDeliveredTime = event.timeStamp,
        symbol = detail[symbol_s];
      if (!existingSymbols.has(symbol)) {
        existingSymbols.add(symbol);
        var route = qRouteEl?.[getAttribute_s](`q:${route_s}`) || '/';
        qSymbols.push({
          [symbol_s]: symbol,
          [route_s]: route,
          delay: round(0 - lastReqTime + symbolRequestTime),
          latency: round(symbolDeliveredTime - symbolRequestTime),
          timeline: round(0 - qRouteChangeTime + symbolRequestTime),
          interaction: !!detail.element,
        });
        lastReqTime = symbolDeliveredTime;
        debounceFlush();
      }
    });
    window[addEventListener_s](error_s, (event: ErrorEvent) => {
      var error = event[error_s];
      if (!(error && typeof error === 'object')) {
        return;
      }
      var payload = {
        url: `${location}`,
        [manifestHash_s]: manifestHash,
        timestamp: new Date().getTime(),
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        [message_s]: event[message_s],
        [error_s]: message_s in error ? (error as Error)[message_s] : `${error}`,
        [stack_s]: stack_s in error ? (error as Error)[stack_s] || '' : '',
      } satisfies InsightsError;
      navigator[sendBeacon_s](`${postUrl}${error_s}/`, JSON_stringify(payload));
    });
  })(window as any, document, location, navigator, performance, Math.round, JSON.stringify)
);

// We don't add window. to save some bytes
declare var __QI_KEY__: string;
declare var __QI_URL__: string;

export const Insights = component$<{ publicApiKey: string; postUrl?: string }>(
  ({ publicApiKey, postUrl }) => {
    if (!publicApiKey) {
      return null;
    }

    return (
      // the script will set the variables before the qinit event
      <script
        document:onQInit$={insightsPing}
        dangerouslySetInnerHTML={`__QI_KEY__=${JSON.stringify(publicApiKey)};__QI_URL__=${JSON.stringify(postUrl || `https://insights.qwik.dev/api/v1/${publicApiKey}/post/`)}`}
      />
    );
  }
);
