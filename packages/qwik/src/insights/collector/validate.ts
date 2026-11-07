import type { InsightSymbol, InsightsError, InsightsPayload } from '../insights';

/** Largest beacon body accepted; the gate dedupes symbols, so real beacons stay far below this. */
export const MAX_BEACON_BYTES = 256 * 1024;
const MAX_SYMBOLS = 1000;
const MAX_KEY_LENGTH = 64;
const MAX_SYMBOL_LENGTH = 256;
const MAX_ROUTE_LENGTH = 1024;

const isBoundedString = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength;

const isTiming = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function parseSymbol(raw: unknown): InsightSymbol | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const event = raw as Record<string, unknown>;
  if (
    !isBoundedString(event.symbol, MAX_SYMBOL_LENGTH) ||
    !isBoundedString(event.route, MAX_ROUTE_LENGTH) ||
    !isTiming(event.delay) ||
    !isTiming(event.latency) ||
    !isTiming(event.timeline)
  ) {
    return null;
  }
  return {
    symbol: event.symbol,
    route: event.route,
    delay: event.delay,
    latency: event.latency,
    timeline: event.timeline,
    interaction: !!event.interaction,
  };
}

/**
 * Check an untrusted beacon body against the payload shape and size limits. Returns a clean copy,
 * or null when anything is missing, mistyped or oversized — the whole beacon is dropped rather than
 * partially recorded, because one bad symbol would break its `previousSymbol` chain.
 */
export function parseInsightsPayload(raw: unknown): InsightsPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = raw as Record<string, unknown>;
  const { publicApiKey, manifestHash } = payload;
  const previousSymbol = payload.previousSymbol ?? null;
  if (
    !isBoundedString(publicApiKey, MAX_KEY_LENGTH) ||
    publicApiKey.length <= 4 ||
    !isBoundedString(manifestHash, MAX_KEY_LENGTH) ||
    (previousSymbol !== null && !isBoundedString(previousSymbol, MAX_SYMBOL_LENGTH)) ||
    !Array.isArray(payload.symbols) ||
    payload.symbols.length > MAX_SYMBOLS
  ) {
    return null;
  }
  const symbols: InsightSymbol[] = [];
  for (let i = 0; i < payload.symbols.length; i++) {
    const symbol = parseSymbol(payload.symbols[i]);
    if (!symbol) {
      return null;
    }
    symbols.push(symbol);
  }
  return {
    qVersion: typeof payload.qVersion === 'string' ? payload.qVersion.slice(0, 32) : 'unknown',
    publicApiKey,
    manifestHash,
    previousSymbol: previousSymbol as string | null,
    symbols,
  };
}

const MAX_ERROR_TEXT_LENGTH = 1024;
const MAX_STACK_LENGTH = 8192;

const clippedText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.slice(0, maxLength) : '';
const integerOrZero = (value: unknown) => (Number.isInteger(value) ? (value as number) : 0);

/** Check an untrusted error beacon; long texts are clipped rather than rejected. */
export function parseInsightsError(raw: unknown): InsightsError | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const error = raw as Record<string, unknown>;
  if (!isBoundedString(error.manifestHash, MAX_KEY_LENGTH) || typeof error.message !== 'string') {
    return null;
  }
  return {
    manifestHash: error.manifestHash,
    timestamp: integerOrZero(error.timestamp),
    url: clippedText(error.url, MAX_ROUTE_LENGTH),
    source: clippedText(error.source, MAX_ROUTE_LENGTH),
    line: integerOrZero(error.line),
    column: integerOrZero(error.column),
    message: clippedText(error.message, MAX_ERROR_TEXT_LENGTH),
    error: clippedText(error.error, MAX_ERROR_TEXT_LENGTH),
    stack: clippedText(error.stack, MAX_STACK_LENGTH),
  };
}
