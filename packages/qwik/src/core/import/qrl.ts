import { EMPTY_ARRAY } from '../util/flyweight';
import type { QRL } from './qrl.public';
import { isQrl, QRLInternal } from './qrl-class';
import { assertEqual } from '../assert/assert';
import type { ValueOrPromise } from '../util/types';
import type { CorePlatform } from '../platform/types';
import { getDocument } from '../util/dom';
import { logError } from '../util/log';
import { then } from '../util/promises';
import { getPlatform } from '../platform/platform';
import { unwrapSubscriber } from '../use/use-subscriber';
import { tryGetInvokeContext } from '../use/use-core';

let runtimeSymbolId = 0;
const RUNTIME_QRL = '/runtimeQRL';
const INLINED_QRL = '/inlinedQRL';

// https://regexr.com/68v72
const EXTRACT_IMPORT_PATH = /\(\s*(['"])([^\1]+)\1\s*\)/;

// https://regexr.com/690ds
const EXTRACT_SELF_IMPORT = /Promise\s*\.\s*resolve/;

// https://regexr.com/6a83h
const EXTRACT_FILE_NAME = /[\\/(]([\w\d.\-_]+\.(js|ts)x?):/;

export function toInternalQRL<T>(qrl: QRL<T>): QRLInternal<T> {
  assertEqual(isQrl(qrl), true);
  return qrl as QRLInternal<T>;
}

/**
 * Lazy-load a `QRL` symbol and return the lazy-loaded value.
 *
 * @see `QRL`
 *
 * @param element - Location of the URL to resolve against. This is needed to take `q:base` into
 * account.
 * @param qrl - QRL to load.
 * @returns A resolved QRL value as a Promise.
 */
export function qrlImport<T>(element: Element | undefined, qrl: QRL<T>): ValueOrPromise<T> {
  const qrl_ = toInternalQRL(qrl);
  if (qrl_.symbolRef) return qrl_.symbolRef;
  if (qrl_.symbolFn) {
    return (qrl_.symbolRef = qrl_
      .symbolFn()
      .then((module) => (qrl_.symbolRef = module[qrl_.symbol])));
  } else {
    if (!element) {
      throw new Error(
        `QRL '${qrl_.chunk}#${qrl_.symbol || 'default'}' does not have an attached container`
      );
    }
    const symbol = getPlatform(getDocument(element)).importSymbol(element, qrl_.chunk, qrl_.symbol);
    return (qrl_.symbolRef = then(symbol, (ref) => {
      return (qrl_.symbolRef = ref);
    }));
  }
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
export function qrl<T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture: any[] | null = EMPTY_ARRAY
): QRL<T> {
  let chunk: string;
  let symbolFn: null | (() => Promise<Record<string, any>>) = null;
  if (typeof chunkOrFn === 'string') {
    chunk = chunkOrFn;
  } else if (typeof chunkOrFn === 'function') {
    symbolFn = chunkOrFn;
    let match: RegExpMatchArray | null;
    const srcCode = String(chunkOrFn);
    if ((match = srcCode.match(EXTRACT_IMPORT_PATH)) && match[2]) {
      chunk = match[2];
    } else if ((match = srcCode.match(EXTRACT_SELF_IMPORT))) {
      const ref = 'QWIK-SELF';
      const frames = new Error(ref).stack!.split('\n');
      const start = frames.findIndex((f) => f.includes(ref));
      const frame = frames[start + 2];
      match = frame.match(EXTRACT_FILE_NAME);
      if (!match) {
        chunk = 'main';
      } else {
        chunk = match[1];
      }
    } else {
      throw new Error('Q-ERROR: Dynamic import not found: ' + srcCode);
    }
  } else {
    throw new Error('Q-ERROR: Unknown type argument: ' + chunkOrFn);
  }

  // Unwrap subscribers
  unwrapLexicalScope(lexicalScopeCapture);
  const qrl = new QRLInternal<T>(chunk, symbol, null, symbolFn, null, lexicalScopeCapture);
  const ctx = tryGetInvokeContext();
  if (ctx && ctx.element) {
    qrl.setContainer(ctx.element);
  }
  return qrl;
}

export function runtimeQrl<T>(symbol: T, lexicalScopeCapture: any[] = EMPTY_ARRAY): QRL<T> {
  return new QRLInternal<T>(
    RUNTIME_QRL,
    's' + runtimeSymbolId++,
    symbol,
    null,
    null,
    lexicalScopeCapture
  );
}

/**
 * @alpha
 */
export function inlinedQrl<T>(
  symbol: T,
  symbolName: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> {
  // Unwrap subscribers
  return new QRLInternal<T>(
    INLINED_QRL,
    symbolName,
    symbol,
    null,
    null,
    unwrapLexicalScope(lexicalScopeCapture)
  );
}

function unwrapLexicalScope(lexicalScope: any[] | null) {
  if (Array.isArray(lexicalScope)) {
    for (let i = 0; i < lexicalScope.length; i++) {
      lexicalScope[i] = unwrapSubscriber(lexicalScope[i]);
    }
  }
  return lexicalScope;
}

export interface QRLSerializeOptions {
  platform?: CorePlatform;
  element?: Element;
  getObjId?: (obj: any) => string | null;
}

export function stringifyQRL(qrl: QRL, opts: QRLSerializeOptions = {}) {
  const qrl_ = toInternalQRL(qrl);
  let symbol = qrl_.symbol;
  let chunk = qrl_.chunk;
  const refSymbol = qrl_.refSymbol ?? symbol;
  const platform = opts.platform;
  const element = opts.element;
  if (platform) {
    const result = platform.chunkForSymbol(refSymbol);
    if (result) {
      chunk = result[0];
      if (!qrl_.refSymbol) {
        symbol = result[1];
      }
    }
  }
  const parts: string[] = [chunk];
  if (symbol && symbol !== 'default') {
    parts.push('#', symbol);
  }
  const capture = qrl_.capture;
  const captureRef = qrl_.captureRef;
  if (opts.getObjId) {
    if (captureRef && captureRef.length) {
      const capture = captureRef.map(opts.getObjId);
      parts.push(`[${capture.join(' ')}]`);
    }
  } else if (capture && capture.length > 0) {
    parts.push(`[${capture.join(' ')}]`);
  }
  const qrlString = parts.join('');
  if (qrl_.chunk === RUNTIME_QRL && element) {
    const qrls: Set<QRL> = (element as any).__qrls__ || ((element as any).__qrls__ = new Set());
    qrls.add(qrl);
  }
  return qrlString;
}

export function qrlToUrl(element: Element, qrl: QRL): URL {
  return new URL(stringifyQRL(qrl), getDocument(element).baseURI);
}

/**
 * `./chunk#symbol|symbol.propA.propB|[captures]
 */
export function parseQRL(qrl: string, el?: Element): QRLInternal {
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

  if (chunk === RUNTIME_QRL) {
    logError(`Q-ERROR: '${qrl}' is runtime but no instance found on element.`);
  }
  const iQrl = new QRLInternal(chunk, symbol, null, null, capture, null);
  if (el) {
    iQrl.setContainer(el);
  }
  return iQrl;
}

function indexOf(text: string, startIdx: number, char: string) {
  const endIdx = text.length;
  const charIdx = text.indexOf(char, startIdx == endIdx ? 0 : startIdx);
  return charIdx == -1 ? endIdx : charIdx;
}

export function toQrlOrError<T>(symbolOrQrl: T | QRL<T>): QRLInternal<T> {
  if (!isQrl(symbolOrQrl)) {
    if (typeof symbolOrQrl == 'function' || typeof symbolOrQrl == 'string') {
      symbolOrQrl = runtimeQrl(symbolOrQrl);
    } else {
      // TODO(misko): centralize
      throw new Error(`Q-ERROR Only 'function's and 'string's are supported.`);
    }
  }
  return symbolOrQrl as QRLInternal<T>;
}
