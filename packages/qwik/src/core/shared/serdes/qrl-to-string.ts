import { isDev } from '@qwik.dev/core/build';
import { type SerializationContext } from './serialization-context';
import { qError, QError } from '../error/error';
import { getPlatform } from '../platform/platform';
import { createQRL, type QRLInternal, type SyncQRLInternal } from '../qrl/qrl-class';
import { isSyncQrl } from '../qrl/qrl-utils';
import { assertDefined } from '../error/assert';

/** @internal */
export function qrlToString(
  serializationContext: SerializationContext,
  qrl: QRLInternal | SyncQRLInternal
): string;
/** @internal */
export function qrlToString(
  serializationContext: SerializationContext,
  qrl: QRLInternal | SyncQRLInternal,
  raw: true
): [string, string, string | null];
export function qrlToString(
  serializationContext: SerializationContext,
  qrl: QRLInternal | SyncQRLInternal,
  raw?: true
): string | [string, string, string | null] {
  let symbol = qrl.$symbol$;
  let chunk = qrl.$chunk$;

  const platform = getPlatform();
  if (platform) {
    const result = isDev
      ? platform.chunkForSymbol(symbol, chunk, qrl.dev?.file)
      : platform.chunkForSymbol(symbol, chunk);
    if (result) {
      chunk = result[1];
      symbol = result[0];
    }
  }

  const isSync = isSyncQrl(qrl);
  if (!isSync) {
    // If we have a symbol we need to resolve the chunk.
    if (!chunk) {
      chunk = serializationContext.$symbolToChunkResolver$(qrl.$hash$);
    }
    // in Dev mode we need to keep track of the symbols
    if (isDev) {
      const backChannel: Map<string, unknown> = ((globalThis as any).__qrl_back_channel__ ||=
        new Map());
      // During tests the resolved value is always available
      backChannel.set(qrl.$symbol$, qrl.$symbolRef$);
      if (!chunk) {
        chunk = QRL_RUNTIME_CHUNK;
      }
    }
    if (!chunk) {
      throw qError(QError.qrlMissingChunk, [qrl.$symbol$]);
    }
    if (chunk.startsWith('./')) {
      chunk = chunk.slice(2);
    }
  } else {
    const fn = qrl.resolved as Function;
    chunk = '';
    // TODO test that provided stringified fn is used
    symbol = String(serializationContext.$addSyncFn$(null, 0, fn));
  }

  const captures = qrl.getCaptured();

  let captureIds: string | null = null;
  if (captures && captures.length > 0) {
    // We refer by id so every capture needs to be a root
    captureIds = captures.map((ref) => `${serializationContext.$addRoot$(ref)}`).join(' ');
  }
  if (raw) {
    return [chunk, symbol, captureIds];
  }
  let qrlStringInline = `${chunk}#${symbol}`;
  if (captureIds) {
    qrlStringInline += `#${captureIds}`;
  }
  return qrlStringInline;
}

export function createQRLWithBackChannel(
  chunk: string,
  symbol: string,
  captures: string | unknown[] | null
): QRLInternal<any> {
  let qrlImporter = null;
  if (isDev && chunk === QRL_RUNTIME_CHUNK) {
    const backChannel: Map<string, Function> = (globalThis as any).__qrl_back_channel__;
    isDev && assertDefined(backChannel, 'Missing QRL_RUNTIME_CHUNK');
    const fn = backChannel.get(symbol);
    if (fn) {
      qrlImporter = () => Promise.resolve({ [symbol]: fn });
    }
  }
  return createQRL(chunk, symbol, null, qrlImporter, captures);
}

/** Parses "chunk#hash#...rootRef" */
export function parseQRL(qrl: string): QRLInternal<any> {
  const [chunk, symbol, captures] = qrl.split('#');
  return createQRLWithBackChannel(chunk, symbol, captures || null);
}

export const QRL_RUNTIME_CHUNK = 'mock-chunk';
