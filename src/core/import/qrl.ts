/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { QObject } from '..';
import { assertDefined, assertEqual } from '../assert/assert';
import { qJsonParse, qJsonStringify } from '../json/q-json';

/**
 * `QRL` (Qwik Resource Locator) represents an import which points to a lazy loaded resource.
 *
 * QRL is a URL pointing to a lazy loaded resource. Because the URLs need to be verified
 * (and possibly bundled) there needs to be a way to identify all URL strings in the system.
 * QRL serves the purpose of statically tagging all URLs for static code analysis and for
 * development mode verification.
 *
 * QRLs can use custom protocols for referring to URLs in a baseURI independent way. This is
 * useful for third-party libraries. Third-party libraries don't know what URL they will be
 * installed at. For this reason the third-party libraries do all QRLs prefixed with
 * custom protocol and rely on the application to configure such protocol.
 *
 * ```
 * QRL`someLibrary:/someImport`
 *
 * Q = {
 *   protocol: {
 *     'someLibrary': 'somePath'
 *   }
 * }
 * ```
 * The `QRL` looks up `foo` in `QRLProtocolMap` resulting in `somePath/someImport`.
 *
 * @public
 */
export interface QRL<T = any> {
  __brand__: 'QRL' | 'QHook';
  __brand__T__: T;
}

/**
 * Tag template literal factory.
 *
 * SEE: `QRL` interface for details
 *
 * Intended usage:
 * ```
 * QRL`./path_to_resource`
 * ```
 * @public
 */
export function QRL<T = any>(
  messageParts: TemplateStringsArray,
  ...expressions: readonly any[]
): QRL<T> {
  let url = '';
  for (let i = 0; i < messageParts.length; i++) {
    const part = messageParts[i];
    url += part;
    if (i < expressions.length) {
      url += expressions[i];
    }
  }
  assertEqual(
    !!url.match(/^[.|/|\w+:]/),
    true,
    "Expecting URL to start with '.', '/', '<protocol>:'. Was: " + url
  );

  return url as unknown as QRL<T>;
}

export function isQRL(value: any): value is QRL {
  return value && typeof value === 'string';
}

export function isParsedQRL(value: any): value is ParsedQRL {
  return value instanceof ParsedQRL;
}

// TODO(misko): Split this to static and runtime because ParsedQRL should be internal
export class ParsedQRL<T = any> implements QRL<T> {
  // TODO(misko): this class does not feel right.
  __brand__!: 'QRL' | 'QHook';
  __brand__T__!: T;

  _serialized: string | string[] | null = null;
  url: string;
  symbol: string;
  args: null | Record<string, any> = null;

  get(name: string): any | null {
    return (this.args && this.args[name]) || null;
  }

  getState(): string {
    return (this.args && this.args[QRL_STATE]) || '';
  }

  constructor(url: string, symbol: string, params: Record<string, any> | null) {
    this.url = url;
    this.symbol = symbol;
    this.args = params;
  }

  with(args: Record<string, any>) {
    const p = cloneQrlParams(this);
    Object.assign(p, args);
    return new ParsedQRL(this.url, this.symbol, p);
  }

  toString(): string {
    return stringifyQRL(this) as string;
  }
}

export const QRL_STATE = '.';
const MOCK_BASE = 'http://q/';

function cloneQrlParams(qrl: ParsedQRL): Record<string, any> {
  return qrl.args ? { ...qrl.args } : {};
}

export function parseQRL<T = any>(
  qrl: QRL<T> | string,
  map?: Map<string, QObject<any>>
): ParsedQRL<T> {
  assertDefined(qrl);
  const string = String(qrl);
  let hashIdx = string.indexOf('#');
  if (hashIdx == -1) hashIdx = string.length;
  const url = string.substring(0, hashIdx);
  const urlParsed = new URL(string.substr(hashIdx + 1), MOCK_BASE);
  const symbol = urlParsed.pathname.substr(1);
  const params: Record<string, any> = {};
  const tMap = map && trackingMap(map);
  urlParsed.searchParams.forEach((v, k) => {
    params[k] = qJsonParse(v, tMap);
  });
  const parsedQRL = new ParsedQRL(url, symbol, params);
  parsedQRL._serialized = tMap && tMap.items ? [string, ...tMap.items] : string;
  return parsedQRL;
}

export function stringifyQRL<T = any>(parsedQRL: ParsedQRL<T>, map?: Map<string, any>): string {
  const url = new URL(parsedQRL.symbol, MOCK_BASE);
  if (parsedQRL.args) {
    for (const key in parsedQRL.args) {
      if (Object.prototype.hasOwnProperty.call(parsedQRL.args, key)) {
        const value = qJsonStringify(parsedQRL.args[key], map);
        url.searchParams.set(key, value);
      }
    }
  }
  const hash = url.toString().substr(MOCK_BASE.length);
  const string = parsedQRL.url + (hash ? '#' + hash : '');
  parsedQRL._serialized = string;
  return string;
}

function trackingMap(map: Map<string, any>): Map<string, any> & { items: string[] | null } {
  const tMap: {
    items: string[] | null;
    get: (key: string) => any;
    set: (key: string, value: any) => void;
  } = {
    items: null,
    get(key: string) {
      const items = tMap.items || (tMap.items = []);
      items.push(key);
      return map.get(key);
    },
    set(key: string, value: any) {
      const items = tMap.items || (tMap.items = []);
      items.push(key);
      map.set(key, value);
    },
  };
  return tMap as any;
}
