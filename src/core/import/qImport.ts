/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { QRL } from './qrl.js';
import { QError, qError } from '../error/error.js';

let importCache: Map<string, unknown | Promise<unknown>>;
declare const __mockImport: (path: string) => Promise<any>;

/**
 * Lazy load a `QRL` symbol and returns the resulting value.
 *
 * @param base -`QRL`s are relative, and therefore they need a base for resolution.
 *    - `Element` use `base.ownerDocument.baseURI`
 *    - `Document` use `base.baseURI`
 * @param url - A relative URL (as `string` or `QRL`) or fully qualified `URL`
 * @returns A cached value synchronously or promise of imported value.
 * @public
 */
export function qImport<T>(base: Element | Document, url: string | QRL<T> | URL): T | Promise<T> {
  if (!importCache) importCache = new Map<string, unknown | Promise<unknown>>();

  const normalizedUrl = toUrl(base, url);
  const importPath = toImportPath(normalizedUrl);
  const exportName = qExport(normalizedUrl);
  const cacheKey = `${importPath}#${exportName}`;
  const cacheValue = importCache.get(cacheKey);
  if (cacheValue) return cacheValue as T | Promise<T>;

  // TODO(misko): Concern: When in `cjs` mode we should be using require?
  const promise = (
    typeof __mockImport === 'function'
      ? __mockImport(importPath + '.js')
      : import(importPath + '.js')
  ).then((module) => {
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
export function toUrl(node: Node, url: string | QRL | URL): URL {
  if (typeof url === 'string') {
    const doc = node.ownerDocument || (node as Document);
    const baseURI = getConfig(doc, `baseURI`) || doc.baseURI;
    return new URL(adjustProtocol(doc, url), baseURI);
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
 * Paths such as
 * ```
 * QRL`foo:/bar`
 * ```
 *
 * The `QRL` looks up `foo` in the document's `<link ref="q.protocol.foo" href="somePath">`
 * resulting in `somePath/bar`
 *
 * @param doc
 * @param qrl
 * @returns URL where the custom protocol has been resolved.
 */
function adjustProtocol(doc: Document, qrl: string | QRL): string {
  return String(qrl).replace(/(^\w+):\/?/, (all, protocol) => {
    let value = getConfig(doc, `protocol.` + protocol);
    if (value && !value.endsWith('/')) {
      value = value + '/';
    }
    return value || all;
  });
}

const configCache = new Map<string, string | undefined | null>();

function getConfig(doc: Document, configKey: string) {
  let value: string | null | undefined = configCache.get(configKey);
  if (!value) {
    const linkElm = doc.querySelector(`link[rel="q.${configKey}"]`) as HTMLLinkElement;
    value = linkElm && linkElm.getAttribute('href');
    configCache.set(configKey, value);
  }
  return value;
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
