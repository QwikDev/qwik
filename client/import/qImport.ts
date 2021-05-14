/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { getConfig } from '../config/qGlobal.js';
import { QRL } from './qrl.js';
import { QConfig } from '../config/qGlobal.js';
import { QError, qError } from '../error/error.js';

let importCache: Map<string, unknown | Promise<unknown>>;

/**
 * Lazy load a `QRL` symbol and returns the resulting value.
 *
 * @param base -`QRL`s are relative, and therefore they need a base for resolution.
 *    - `Element` use `base.ownerDocument.baseURI`
 *    - `Document` use `base.baseURI`
 *    - `string` use `base` as is
 *    - `QConfig` use `base.baseURI`
 * @param url - A relative URL (as `string` or `QRL`) or fully qualified `URL`
 * @returns A cached value synchronously or promise of imported value.
 * @public
 */
export function qImport<T>(
  base: Element | Document | string | QConfig,
  url: string | QRL<T> | URL
): T | Promise<T> {
  if (!importCache) importCache = new Map<string, unknown | Promise<unknown>>();

  const normalizedUrl = toUrl(toBaseURI(base), url);
  const importPath = toImportPath(normalizedUrl);
  const exportName = qExport(normalizedUrl);
  const cacheKey = `${importPath}#${exportName}`;
  const cacheValue = importCache.get(cacheKey);
  if (cacheValue) return cacheValue as T | Promise<T>;

  const promise = import(importPath + '.js').then((module) => {
    const handler = module[exportName];
    if (!handler)
      throw qError(
        QError.Core_missingExport_name_url_props,
        exportName,
        importPath,
        Object.keys(module)
      );
    qImportSet(cacheKey, handler);
    return handler;
  });
  qImportSet(cacheKey, promise);
  return promise;
}

export function qImportSet(url: string, value: any): void {
  importCache.set(url, value);
}

/**
 * Retrieves the base URI.
 *
 * @param base -`QRL`s are relative, and therefore they need a base for resolution.
 *    - `Element` use `base.ownerDocument.baseURI`
 *    - `Document` use `base.baseURI`
 *    - `string` use `base` as is
 *    - `QConfig` use `base.baseURI`
 * @returns Base URI.
 */
export function toBaseURI(base: QConfig | Element | Document | string): string {
  if (typeof base === 'string') return base;
  const document = (base as Element).ownerDocument || base;
  return document.baseURI;
}

/**
 * Convert relative base URI and relative URL into a fully qualified URL.
 *
 * @param base -`QRL`s are relative, and therefore they need a base for resolution.
 *    - `Element` use `base.ownerDocument.baseURI`
 *    - `Document` use `base.baseURI`
 *    - `string` use `base` as is
 *    - `QConfig` use `base.baseURI`
 * @param url - relative URL
 * @returns fully qualified URL.
 */
export function toUrl(baseURI: string, url: string | QRL | URL): URL {
  if (typeof url === 'string') {
    const config = getConfig(baseURI);
    return new URL(adjustProtocol(config, url), config.baseURI);
  } else {
    return url as URL;
  }
}

/**
 * Removes URL decorations such as search and hash, and normalizes extensions,
 * returning naked URL for importing.
 *
 * @param url - to clean.
 * @returns naked URL.
 */
export function toImportPath(url: URL): string {
  const tmp = new URL(String(url));
  tmp.hash = '';
  tmp.search = '';
  return String(tmp).replace(/\.(ts|tsx)$/, '.js');
}

/**
 * Convert custom protocol to path by looking it up in `QConfig`
 *
 * Pats such as
 * ```
 * QRL`foo:/bar`
 *
 * Q = {
 *   protocol: {
 *     'foo': 'somePath'
 *   }
 * }
 * ```
 * The `QRL` looks up `foo` in `QRLProtocolMap` resulting in `somePath/bar`
 *
 * @param qConfig
 * @param qrl
 * @returns URL where the custom protocol has been resolved.
 */
export function adjustProtocol(qConfig: QConfig, qrl: string | QRL): string {
  return String(qrl).replace(/(^\w+):\/?/, (all, protocol) => {
    let value = qConfig.protocol[protocol];
    if (!value) return all;
    if (!value.endsWith('/')) {
      value = value + '/';
    }
    return value;
  });
}

/**
 * Extract the QRL export name from a URL.
 *
 * This name is encoded in the hash of the URL, before any `?`.
 */
export function qExport(url: URL): string {
  // 1 - optional `#` at the start.
  // 2 - capture group `$1` containing the export name, stopping at the first `?`.
  // 3 - the rest from the first `?` to the end.
  // The hash string is replaced by the captured group that contains only the export name.
  //                       1112222222333
  return url.hash.replace(/^#?([^?]*).*$/, '$1') || 'default';
}

/**
 * Extract the QRL params from a URL.
 *
 * These params are encoded after the `?` in the hash of the URL, not the URL's search params.
 */
export function qParams(url: URL): URLSearchParams {
  // 1 - everything up to the first `?` (or the end of the string).
  // 2 - an optional `?`.
  // 3 - capture group `$1` containing everything after the first `?` to the end of the string.
  // The hash string is replaced by the captured group that contains only the serialized params.
  //                                           11111122233333
  return new URLSearchParams(url.hash.replace(/^[^?]*\??(.*)$/, '$1'));
}
