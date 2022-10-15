import { EMPTY_ARRAY } from '../util/flyweight';
import type { QRL } from './qrl.public';
import { assertQrl, createQRL, emitEvent, getSymbolHash, QRLInternal } from './qrl-class';
import { isFunction, isString } from '../util/types';
import {
  qError,
  QError_dynamicImportFailed,
  QError_qrlMissingChunk,
  QError_unknownTypeArgument,
} from '../error/error';
import { qRuntimeQrl, qSerialize } from '../util/qdev';
import { getPlatform } from '../platform/platform';
import type { QwikElement } from '../render/dom/virtual-element';
import { assertDefined, assertTrue } from '../error/assert';
import { assertElement } from '../util/element';
import type { MustGetObjID } from '../container/container';
import type { QContext } from '../state/context';

// https://regexr.com/68v72
const EXTRACT_IMPORT_PATH = /\(\s*(['"])([^\1]+)\1\s*\)/;

// https://regexr.com/690ds
const EXTRACT_SELF_IMPORT = /Promise\s*\.\s*resolve/;

// https://regexr.com/6a83h
const EXTRACT_FILE_NAME = /[\\/(]([\w\d.\-_]+\.(js|ts)x?):/;

const announcedQRL = /*@__PURE__*/ new Set<string>();

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
 * @alpha
 */
// </docs>
export const qrl = <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY,
  stackOffset = 0
): QRL<T> => {
  let chunk: string | null = null;
  let symbolFn: null | (() => Promise<Record<string, any>>) = null;
  if (isFunction(chunkOrFn)) {
    symbolFn = chunkOrFn;
    if (qSerialize) {
      let match: RegExpMatchArray | null;
      const srcCode = String(chunkOrFn);
      if ((match = srcCode.match(EXTRACT_IMPORT_PATH)) && match[2]) {
        chunk = match[2];
      } else if ((match = srcCode.match(EXTRACT_SELF_IMPORT))) {
        const ref = 'QWIK-SELF';
        const frames = new Error(ref).stack!.split('\n');
        const start = frames.findIndex((f) => f.includes(ref));
        const frame = frames[start + 2 + stackOffset];
        match = frame.match(EXTRACT_FILE_NAME);
        if (!match) {
          chunk = 'main';
        } else {
          chunk = match[1];
        }
      } else {
        throw qError(QError_dynamicImportFailed, srcCode);
      }
    }
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
export const qrlDEV = <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  opts: QRLDev,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  const newQrl = qrl(chunkOrFn, symbol, lexicalScopeCapture, 1) as QRLInternal<T>;
  newQrl.$dev$ = opts;
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
  qrl.$dev$ = opts;
  return qrl;
};

export interface QRLSerializeOptions {
  $element$?: QwikElement;
  $getObjId$?: MustGetObjID;
  $addRefMap$?: (obj: any) => number;
}

export const serializeQRL = (qrl: QRLInternal, opts: QRLSerializeOptions = {}) => {
  assertTrue(qSerialize, 'In order to serialize a QRL, qSerialize must be true');
  assertQrl(qrl);
  let symbol = qrl.$symbol$;
  let chunk = qrl.$chunk$;
  const refSymbol = qrl.$refSymbol$ ?? symbol;
  const platform = getPlatform();

  if (platform) {
    const result = platform.chunkForSymbol(refSymbol);
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
    throw qError(QError_qrlMissingChunk, qrl);
  }
  if (chunk.startsWith('./')) {
    chunk = chunk.slice(2);
  }
  const parts: string[] = [chunk, '#', symbol];
  const capture = qrl.$capture$;
  const captureRef = qrl.$captureRef$;
  if (captureRef && captureRef.length) {
    if (opts.$getObjId$) {
      const capture = captureRef.map(opts.$getObjId$);
      parts.push(`[${capture.join(' ')}]`);
    } else if (opts.$addRefMap$) {
      const capture = captureRef.map(opts.$addRefMap$);
      parts.push(`[${capture.join(' ')}]`);
    }
  } else if (capture && capture.length > 0) {
    parts.push(`[${capture.join(' ')}]`);
  }
  return parts.join('');
};

export const serializeQRLs = (existingQRLs: QRLInternal<any>[], elCtx: QContext): string => {
  assertElement(elCtx.$element$);
  const opts: QRLSerializeOptions = {
    $element$: elCtx.$element$,
    $addRefMap$: (obj) => addToArray(elCtx.$refMap$, obj),
  };
  return existingQRLs.map((qrl) => serializeQRL(qrl, opts)).join('\n');
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
  // TODO
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
    return array.length - 1;
  }
  return index;
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
