/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { EMPTY_ARRAY } from '../util/flyweight';
import type { QRL } from './qrl.public';
import { isQrl, QRLInternal } from './qrl-class';
import { assertEqual } from '../assert/assert';
import type { CorePlatform } from '../index';
import { getDocument } from '../util/dom';
import { logError } from '../util/log';

let runtimeSymbolId = 0;
const RUNTIME_QRL = '/runtimeQRL';

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

export function staticQrl<T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture: any[] = EMPTY_ARRAY
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
  return new QRLInternal<T>(chunk, symbol, null, symbolFn, null, lexicalScopeCapture, null);
}

export function runtimeQrl<T>(symbol: T, lexicalScopeCapture: any[] = EMPTY_ARRAY): QRLInternal<T> {
  return new QRLInternal<T>(
    RUNTIME_QRL,
    's' + runtimeSymbolId++,
    symbol,
    null,
    null,
    lexicalScopeCapture,
    null
  );
}

export function stringifyQRL(qrl: QRL, platform?: CorePlatform, element?: Element) {
  const qrl_ = toInternalQRL(qrl);
  const symbol = qrl_.symbol;
  const chunk = platform ? platform.chunkForSymbol(symbol) ?? qrl_.chunk : qrl_.chunk;

  const parts: string[] = [chunk];
  if (symbol && symbol !== 'default') {
    parts.push('#', symbol);
  }
  const guard = qrl_.guard;
  guard?.forEach((value, key) =>
    parts.push('|', key, value && value.length ? '.' + value.join('.') : '')
  );
  const capture = qrl_.capture;
  if (capture && capture.length > 0) {
    parts.push(JSON.stringify(capture));
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
export function parseQRL(qrl: string, element?: Element): QRLInternal {
  if (element) {
    const qrls: QRLInternal[] | undefined = (element as any).__qrls__;
    if (qrls) {
      for (const runtimeQrl of qrls) {
        if (stringifyQRL(runtimeQrl) == qrl) {
          return runtimeQrl;
        }
      }
    }
  }
  const endIdx = qrl.length;
  const hashIdx = indexOf(qrl, 0, '#');
  const guardIdx = indexOf(qrl, hashIdx, '|');
  const captureIdx = indexOf(qrl, guardIdx, '[');

  const chunkEndIdx = Math.min(hashIdx, guardIdx, captureIdx);
  const chunk = qrl.substring(0, chunkEndIdx);

  const symbolStartIdx = hashIdx == endIdx ? hashIdx : hashIdx + 1;
  const symbolEndIdx = Math.min(guardIdx, captureIdx);
  const symbol =
    symbolStartIdx == symbolEndIdx ? 'default' : qrl.substring(symbolStartIdx, symbolEndIdx);

  const guardStartIdx = guardIdx;
  const guardEndIdx = captureIdx;
  const guard =
    guardStartIdx < guardEndIdx ? parseGuard(qrl.substring(guardStartIdx, guardEndIdx)) : null;

  const captureStartIdx = captureIdx;
  const captureEndIdx = endIdx;
  const capture =
    captureStartIdx === captureEndIdx
      ? EMPTY_ARRAY
      : JSONparse(qrl.substring(captureStartIdx, captureEndIdx));

  if (chunk === RUNTIME_QRL) {
    logError(`Q-ERROR: '${qrl}' is runtime but no instance found on element.`);
  }
  return new QRLInternal(chunk, symbol, null, null, capture, null, guard);
}

function JSONparse(json: string): any {
  try {
    return JSON.parse(json);
  } catch (e) {
    logError('JSON:', json);
    throw e;
  }
}

function parseGuard(text: string): null | Map<string, string[]> {
  let map: null | Map<string, string[]> = null;
  if (text) {
    text.split('|').forEach((obj) => {
      if (obj) {
        const parts = obj.split('.');
        const id = parts.shift()!;
        if (!map) map = new Map<string, string[]>();
        map.set(id, parts);
      }
    });
  }
  return map;
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
