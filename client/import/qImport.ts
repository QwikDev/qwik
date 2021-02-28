/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from './qrl.js';

let importCache: Map<string, unknown | Promise<unknown>>;

export function qImport<T>(element: Element, url: string | QRL | URL): T | Promise<T> {
  if (!importCache) importCache = new Map<string, unknown | Promise<unknown>>();
  const baseURI = element.ownerDocument.baseURI;
  const _url = url instanceof URL ? url : new URL(String(url), baseURI);
  const pathname = _url.pathname;
  const cacheValue = importCache.get(pathname);
  if (cacheValue) return cacheValue as T;
  const promise = qImportInternal(url, baseURI, null);
  importCache.set(pathname, promise);
  return promise;
}

export function qImportInternal(
  url: string | QRL | URL,
  baseURI: string,
  stackFrame: string | null
) {
  const _url = url instanceof URL ? url : new URL(String(url), baseURI);
  const pathname = _url.pathname;
  let dotIdx = pathname.lastIndexOf('.');
  let slashIdx = pathname.lastIndexOf('/');
  if (dotIdx === 0 || dotIdx < slashIdx) dotIdx = pathname.length;
  const promise = import(pathname.substr(0, dotIdx) + '.js')
    .then((module) => {
      const key = pathname.substring(dotIdx + 1) || 'default';
      const handler = module[key];
      stackFrame == null && importCache.set(pathname, handler);
      return handler;
    })
    .catch((e) => {
      const error = `QRL-ERROR: '${url}' is not a valid import. \n  Base URL: ${baseURI}\n  => ${stackFrame}\n  => ${e}`;
      console.error(error);
      return Promise.reject(error);
    });
  return promise;
}
