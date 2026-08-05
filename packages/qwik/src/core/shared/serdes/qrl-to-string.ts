import { isDev } from '@qwik.dev/core/build';
import { type SerializationContext } from './serialization-context';
import { qError, QError } from '../error/error';
import { getPlatform } from '../platform/platform';
import {
  createQRL,
  type QrlCaptures,
  type QRLInternal,
  type SyncQRLInternal,
} from '../qrl/qrl-class';
import { isSyncQrl } from '../qrl/qrl-utils';
import { assertDefined } from '../error/assert';
import type { Container } from '../types';
import type { SSRWriteChunk } from '../../ssr/ssr-types';

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
      const lazy = qrl.$lazy$;
      backChannel.set(lazy.$symbol$, lazy.$ref$);
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

  let captureDeltas: string | null = null;
  if (captures && captures.length > 0) {
    // We refer by id so every capture needs to be a root
    let previous = 0;
    let output = '';
    for (let i = 0; i < captures.length; i++) {
      const captureId = serializationContext.$addRoot$(captures[i]);
      const delta = captureId - previous;
      previous = captureId;
      output += (i === 0 ? '' : ' ') + delta;
    }
    captureDeltas = output;
  }
  if (raw) {
    return [chunk, symbol, captureDeltas];
  }
  let qrlStringInline = `${chunk}#${symbol}`;
  if (captureDeltas) {
    qrlStringInline += `#${captureDeltas}`;
  }
  return qrlStringInline;
}

/** @internal */
export function qrlToChunks(
  serializationContext: SerializationContext,
  qrl: QRLInternal | SyncQRLInternal
): string | SSRWriteChunk[] {
  const [chunk, symbol, captures] = qrlToString(serializationContext, qrl, true);
  const prefix = `${chunk}#${symbol}`;
  if (!captures) {
    return prefix;
  }
  const chunks: SSRWriteChunk[] = [prefix, '#'];
  let previousCaptureId = 0;
  let start = 0;
  for (let i = 0; i <= captures.length; i++) {
    if (i === captures.length || captures[i] === ' ') {
      if (i > start) {
        const captureId = previousCaptureId + Number(captures.slice(start, i));
        if (start > 0) {
          chunks.push(' ');
          chunks.push({ id: captureId, base: previousCaptureId });
        } else {
          chunks.push(captureId);
        }
        previousCaptureId = captureId;
      }
      start = i + 1;
    }
  }
  return chunks;
}

export function createQRLWithBackChannel(
  chunk: string,
  symbol: string,
  captures: QrlCaptures,
  container?: Container
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
  return createQRL(chunk, symbol, null, qrlImporter, captures, container);
}

/** Parses "chunk#hash#...captureDelta" */
export function parseQRL(qrl: string, container?: Container): QRLInternal<any> {
  const firstHash = qrl.indexOf('#');
  const secondHash = qrl.indexOf('#', firstHash + 1);
  const chunk = qrl.slice(0, firstHash);
  const symbol =
    secondHash === -1 ? qrl.slice(firstHash + 1) : qrl.slice(firstHash + 1, secondHash);
  const captures =
    secondHash !== -1 && secondHash + 1 < qrl.length ? qrl.slice(secondHash + 1) : null;
  return createQRLWithBackChannel(chunk, symbol, captures, container);
}

export const QRL_RUNTIME_CHUNK = 'mock-chunk';
