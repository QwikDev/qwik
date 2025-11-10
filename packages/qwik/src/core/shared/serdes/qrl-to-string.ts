import { isDev } from '@qwik.dev/core/build';
import { type SerializationContext } from './serialization-context';
import { qError, QError } from '../error/error';
import { getPlatform } from '../platform/platform';
import { createQRL, type QRLInternal, type SyncQRLInternal } from '../qrl/qrl-class';
import { isSyncQrl } from '../qrl/qrl-utils';
import { assertDefined } from '../error/assert';

export function qrlToString(
  serializationContext: SerializationContext,
  value: QRLInternal | SyncQRLInternal
): string;
export function qrlToString(
  serializationContext: SerializationContext,
  value: QRLInternal | SyncQRLInternal,
  raw: true
): [string, string, string[] | null];
export function qrlToString(
  serializationContext: SerializationContext,
  value: QRLInternal | SyncQRLInternal,
  raw?: true
): string | [string, string, string[] | null] {
  let symbol = value.$symbol$;
  let chunk = value.$chunk$;

  const platform = getPlatform();
  if (platform) {
    const result = platform.chunkForSymbol(symbol, chunk, value.dev?.file);
    if (result) {
      chunk = result[1];
      symbol = result[0];
    }
  }

  const isSync = isSyncQrl(value);
  if (!isSync) {
    // If we have a symbol we need to resolve the chunk.
    if (!chunk) {
      chunk = serializationContext.$symbolToChunkResolver$(value.$hash$);
    }
    // in Dev mode we need to keep track of the symbols
    if (isDev) {
      const backChannel: Map<string, unknown> = ((globalThis as any).__qrl_back_channel__ ||=
        new Map());
      // During tests the resolved value is always available
      backChannel.set(value.$symbol$, value.resolved);
      console.log('QRL TO STRING', {
        symbol: value.$symbol$,
        chunk,
        code: value.$symbolRef$?.toString(),
      });

      if (!chunk) {
        chunk = QRL_RUNTIME_CHUNK;
      }
    }
    if (!chunk) {
      throw qError(QError.qrlMissingChunk, [value.$symbol$]);
    }
    if (chunk.startsWith('./')) {
      chunk = chunk.slice(2);
    }
  } else {
    const fn = value.resolved as Function;
    chunk = '';
    // TODO test that provided stringified fn is used
    symbol = String(serializationContext.$addSyncFn$(null, 0, fn));
  }

  let capturedIds: string[] | null = null;
  if (Array.isArray(value.$captureRef$) && value.$captureRef$.length > 0) {
    // We refer by id so every capture needs to be a root
    capturedIds = value.$captureRef$.map((ref) => `${serializationContext.$addRoot$(ref)}`);
  }
  if (raw) {
    return [chunk, symbol, capturedIds];
  }
  let qrlStringInline = `${chunk}#${symbol}`;
  if (capturedIds && capturedIds.length > 0) {
    qrlStringInline += `[${capturedIds.join(' ')}]`;
  }
  return qrlStringInline;
}

export function createQRLWithBackChannel(chunk: string, symbol: string): QRLInternal<any> {
  let qrlRef = null;
  if (isDev && chunk === QRL_RUNTIME_CHUNK) {
    const backChannel: Map<string, Function> = (globalThis as any).__qrl_back_channel__;
    assertDefined(backChannel, 'Missing QRL_RUNTIME_CHUNK');
    qrlRef = backChannel.get(symbol);
  }
  return createQRL(chunk, symbol, qrlRef, null, null);
}

/** Parses "chunk#hash[...rootRef]" */
export function parseQRL(qrl: string): QRLInternal<any> {
  const hashIdx = qrl.indexOf('#');
  const captureStart = qrl.indexOf('[', hashIdx);
  const captureEnd = qrl.indexOf(']', captureStart);
  const chunk = hashIdx > -1 ? qrl.slice(0, hashIdx) : qrl.slice(0, captureStart);

  const symbol = captureStart > -1 ? qrl.slice(hashIdx + 1, captureStart) : qrl.slice(hashIdx + 1);
  const captureIdsString =
    captureStart > -1 && captureEnd > -1 && qrl.slice(captureStart + 1, captureEnd);
  const created = createQRLWithBackChannel(chunk, symbol);
  if (captureIdsString) {
    created.$captureRef$ = captureIdsString as unknown as unknown[];
  }
  return created;
}

export const QRL_RUNTIME_CHUNK = 'mock-chunk';
