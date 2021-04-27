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
  const cacheValue = importCache.get(importPath);
  if (cacheValue) return cacheValue as T;

  let dotIdx = importPath.lastIndexOf('.');
  const slashIdx = importPath.lastIndexOf('/');
  if (dotIdx <= slashIdx) dotIdx = importPath.length;
  const importURL = importPath.substr(0, dotIdx) + '.js';
  const promise = import(importURL).then((module) => {
    const key = importPath.substring(dotIdx + 1) || 'default';
    const handler = module[key];
    if (!handler)
      throw qError(QError.Core_missingExport_name_url_props, key, importURL, Object.keys(module));
    qImportSet(importPath, handler);
    return handler;
  });
  qImportSet(importPath, promise);
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
 * Removes URL decorations such as search and hash and returns naked URL for importing.
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
