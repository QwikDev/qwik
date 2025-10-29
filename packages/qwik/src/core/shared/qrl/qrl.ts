import { QError, qError } from '../error/error';
import { EMPTY_ARRAY } from '../utils/flyweight';
import { qSerialize } from '../utils/qdev';
import { isFunction, isString } from '../utils/types';
import { createQRL, type QRLInternal } from './qrl-class';
import type { QRL } from './qrl.public';

// https://regexr.com/68v72
// @ts-expect-error this is a valid regex
const EXTRACT_IMPORT_PATH = /\(\s*(['"])([^\1]+)\1\s*\)/;

// https://regexr.com/690ds
const EXTRACT_SELF_IMPORT = /Promise\s*\.\s*resolve/;

// https://regexr.com/6a83h
const EXTRACT_FILE_NAME = /[\\/(]([\w\d.\-_]+\.(js|ts)x?):/;

/** @public */
export interface QRLDev {
  file: string;
  lo: number;
  hi: number;
}

// <docs markdown="../../readme.md#qrl">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../../readme.md#qrl instead and run `pnpm docs.sync`)
/**
 * Used by Qwik Optimizer to point to lazy-loaded resources.
 *
 * This function should be used by the Qwik Optimizer only. The function should not be directly
 * referred to in the source code of the application.
 *
 * @param chunkOrFn - Chunk name (or function which is stringified to extract chunk name)
 * @param symbol - Symbol to lazy load
 * @param lexicalScopeCapture - A set of lexically scoped variables to capture.
 * @public
 * @see `QRL`, `$(...)`
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
        throw qError(QError.dynamicImportFailed, [srcCode]);
      }
    }
  } else if (isString(chunkOrFn)) {
    chunk = chunkOrFn;
  } else {
    throw qError(QError.unknownTypeArgument, [chunkOrFn]);
  }

  // Unwrap subscribers
  return createQRL<T>(chunk, symbol, null, symbolFn, null, lexicalScopeCapture);
};

/**
 * Create an inlined QRL. This is mostly useful on the server side for serialization.
 *
 * @param symbol - The object/function to register, or `null` to retrieve a previously registered
 *   one by hash
 * @param symbolName - The name of the symbol.
 * @param lexicalScopeCapture - A set of lexically scoped variables to capture.
 * @public
 */
export const inlinedQrl = <T>(
  symbol: T | null,
  symbolName: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  // Unwrap subscribers
  return createQRL<T>(null, symbolName, symbol, null, null, lexicalScopeCapture);
};

/** @internal */
export const _noopQrl = <T>(
  symbolName: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  return createQRL<T>(null, symbolName, null, null, null, lexicalScopeCapture);
};

/** @internal */
export const _noopQrlDEV = <T>(
  symbolName: string,
  opts: QRLDev,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  const newQrl = _noopQrl(symbolName, lexicalScopeCapture) as QRLInternal<T>;
  newQrl.dev = opts;
  return newQrl;
};

/** @internal */
export const qrlDEV = <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  opts: QRLDev,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
): QRL<T> => {
  const newQrl = qrl(chunkOrFn, symbol, lexicalScopeCapture, 1) as QRLInternal<T>;
  newQrl.dev = opts;
  return newQrl;
};

/** @internal */
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

/**
 * Register a QRL symbol globally for lookup by its hash. This is used by the optimizer to register
 * the names passed in `reg_ctx_name`.
 *
 * @internal
 */
export const _regSymbol = (symbol: any, hash: string) => {
  if (typeof (globalThis as any).__qwik_reg_symbols === 'undefined') {
    (globalThis as any).__qwik_reg_symbols = new Map<string, any>();
  }
  (globalThis as any).__qwik_reg_symbols.set(hash, symbol);
  return symbol;
};
