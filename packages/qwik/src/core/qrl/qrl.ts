import { EMPTY_ARRAY } from '../util/flyweight';
import type { QRL } from './qrl.public';
import { assertQrl, createQRL, emitEvent, getSymbolHash, type QRLInternal } from './qrl-class';
import { isFunction, isString } from '../util/types';
import { qError, QError_qrlMissingChunk, QError_unknownTypeArgument } from '../error/error';
import { qRuntimeQrl, qSerialize } from '../util/qdev';
import { getPlatform } from '../platform/platform';
import { assertDefined, assertTrue, assertElement } from '../error/assert';
import type { MustGetObjID } from '../container/container';
import type { QContext } from '../state/context';
import { mapJoin } from '../container/pause';

const announcedQRL = /*#__PURE__*/ new Set<string>();

/**
 * @public
 */
export interface QRLDev {
  file: string;
  lo: number;
  hi: number;
}

// <docs markdown="../readme.md#qrl">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#qrl instead)
/**
 * Used by Qwik Optimizer to point to lazy-loaded resources.
 *
 * This function should be used by the Qwik Optimizer only. The function should not be directly
 * referred to in the source code of the application.
 *
 * @see `QRL`, `$(...)`
 *
 * @param chunkOrFn - Chunk name (or function which is stringified to extract chunk name)
 * @param symbol - Symbol to lazy load
 * @param lexicalScopeCapture - a set of lexically scoped variables to capture.
 * @public
 */
// </docs>
export const qrl = <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  let chunk: string | null = null;
  let symbolFn: null | (() => Promise<Record<string, any>>) = null;
  if (isFunction(chunkOrFn)) {
    symbolFn = chunkOrFn;
  } else if (isString(chunkOrFn)) {
    chunk = chunkOrFn;
  } else {
    throw qError(QError_unknownTypeArgument, chunkOrFn);
  }

  if (announcedQRL.has(symbol)) {
    // Emit event
    announcedQRL.add(symbol);
    emitEvent('qprefetch', {
      symbols: [getSymbolHash(symbol)],
    });
  }
  // Unwrap subscribers
  return createQRL<T>(chunk, symbol, null, symbolFn, null, lexicalScopeCapture, null);
};

/**
 * @internal
 */
export const inlinedQrl = <T>(
  symbol: T,
  symbolName: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  // Unwrap subscribers
  return createQRL<T>(null, symbolName, symbol, null, null, lexicalScopeCapture, null);
};

/**
 * @internal
 */
export const _noopQrl = <T>(
  symbolName: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  return createQRL<T>(null, symbolName, null, null, null, lexicalScopeCapture, null);
};

/**
 * @internal
 */
export const qrlDEV = <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  opts: QRLDev,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  const newQrl = qrl(chunkOrFn, symbol, lexicalScopeCapture) as QRLInternal<T>;
  newQrl.dev = opts;
  return newQrl;
};

/**
 * @internal
 */
export const inlinedQrlDEV = <T = any>(
  symbol: T,
  symbolName: string,
  opts: QRLDev,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  const qrl = inlinedQrl(symbol, symbolName, lexicalScopeCapture) as QRLInternal<T>;
  qrl.dev = opts;
  return qrl;
};

export const serializeQRL = (qrl: QRLInternal, getObjId: MustGetObjID) => {
  assertTrue(qSerialize, 'In order to serialize a QRL, qSerialize must be true');
  assertQrl(qrl);
  let symbol = qrl.$symbol$;
  let chunk = qrl.$chunk$;
  const refSymbol = qrl.$refSymbol$ ?? symbol;
  const platform = getPlatform();

  if (platform) {
    const result = platform.chunkForSymbol(refSymbol, chunk);
    if (result) {
      chunk = result[1];
      if (!qrl.$refSymbol$) {
        symbol = result[0];
      }
    }
  }

  if (qRuntimeQrl && !chunk) {
    chunk = '/runtimeQRL';
    symbol = '_';
  }
  if (!chunk) {
    throw qError(QError_qrlMissingChunk, qrl.$symbol$);
  }
  if (chunk.startsWith('./')) {
    chunk = chunk.slice(2);
  }
  let output = `${chunk}#${symbol}`;
  const capture = qrl.$capture$;
  const captureRef = qrl.$captureRef$;
  if (captureRef && captureRef.length) {
    output += `[${mapJoin(captureRef, getObjId, ' ')}]`;
  } else if (capture && capture.length > 0) {
    output += `[${capture.join(' ')}]`;
  }
  return output;
};

export const serializeQRLs = (existingQRLs: QRLInternal<any>[], elCtx: QContext): string => {
  assertElement(elCtx.$element$);
  const getObjId = (obj: any) => addToArray(elCtx.$refMap$, obj);
  return mapJoin(existingQRLs, (qrl) => serializeQRL(qrl, getObjId), '\n');
};

/**
 * `./chunk#symbol[captures]
 */
export const parseQRL = (qrl: string, containerEl?: Element): QRLInternal => {
  const endIdx = qrl.length;
  const hashIdx = indexOf(qrl, 0, '#');
  const captureIdx = indexOf(qrl, hashIdx, '[');

  const chunkEndIdx = Math.min(hashIdx, captureIdx);
  const chunk = qrl.substring(0, chunkEndIdx);

  const symbolStartIdx = hashIdx == endIdx ? hashIdx : hashIdx + 1;
  const symbolEndIdx = captureIdx;
  const symbol =
    symbolStartIdx == symbolEndIdx ? 'default' : qrl.substring(symbolStartIdx, symbolEndIdx);

  const captureStartIdx = captureIdx;
  const captureEndIdx = endIdx;
  const capture =
    captureStartIdx === captureEndIdx
      ? EMPTY_ARRAY
      : qrl.substring(captureStartIdx + 1, captureEndIdx - 1).split(' ');

  const iQrl = createQRL<any>(chunk, symbol, null, null, capture, null, null);
  if (containerEl) {
    iQrl.$setContainer$(containerEl);
  }
  return iQrl;
};

const indexOf = (text: string, startIdx: number, char: string) => {
  const endIdx = text.length;
  const charIdx = text.indexOf(char, startIdx == endIdx ? 0 : startIdx);
  return charIdx == -1 ? endIdx : charIdx;
};

const addToArray = (array: any[], obj: any) => {
  const index = array.indexOf(obj);
  if (index === -1) {
    array.push(obj);
    return String(array.length - 1);
  }
  return String(index);
};

export const inflateQrl = (qrl: QRLInternal, elCtx: QContext) => {
  assertDefined(qrl.$capture$, 'invoke: qrl capture must be defined inside useLexicalScope()', qrl);
  return (qrl.$captureRef$ = qrl.$capture$.map((idx) => {
    const int = parseInt(idx, 10);
    const obj = elCtx.$refMap$[int];
    assertTrue(elCtx.$refMap$.length > int, 'out of bounds inflate access', idx);
    return obj;
  }));
};

/**
 * @internal
 */
export const _regSymbol = (symbol: any, hash: string) => {
  if (typeof (globalThis as any).__qwik_reg_symbols === 'undefined') {
    (globalThis as any).__qwik_reg_symbols = new Map<string, any>();
  }
  (globalThis as any).__qwik_reg_symbols.set(hash, symbol);
  return symbol;
};
