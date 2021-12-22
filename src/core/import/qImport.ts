/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { isParsedQRL, QRL } from './qrl';
import { getPlatform } from '../platform/platform';
import { qTest } from '../util/qdev';
import { fromQRL } from './qrl-test';
import { assertDefined } from '../assert/assert';

/**
 * Lazy load a `QRL` symbol and returns the resulting value.
 *
 * @param element - Location of the URL to resolve against.
 * @param url - A relative URL (as `string` or `QRL`) or fully qualified `URL`
 * @returns A cached value synchronously or promise of imported value.
 * @public
 */
export function qImport<T>(element: Element, url: string | QRL<T> | URL): T | Promise<T> {
  if (isParsedQRL(url)) {
    assertDefined(url._serialized);
    url = Array.isArray(url._serialized) ? url._serialized[0] : url._serialized!;
  }
  if (qTest) {
    // This code is here for testing purposes only, and should never end up in production.
    const testSymbol = fromQRL(url as any);
    if (testSymbol) {
      return Promise.resolve<T>(testSymbol);
    }
  }
  const doc: QDocument = element.ownerDocument!;
  const corePlatform = getPlatform(doc);
  const handler = corePlatform.importSymbol(element, url);
  return handler;
}

export function qImportSet(doc: QDocument, cacheKey: string, value: any): void {
  doc[ImportCacheKey]!.set(cacheKey, value);
}

/**
 * Extract the QRL export name from a URL.
 *
 * This name is encoded in the hash of the URL, before any `?`.
 */
export function qExport(url: string): string {
  // 1 - optional `#` at the start.
  // 2 - capture group `$1` containing the export name, stopping at the first `?`.
  // 3 - the rest from the first `?` to the end.
  // The hash string is replaced by the captured group that contains only the export name.
  //                       1112222222333
  const match = url.match(/#([^?]*).*$/);
  return match?.[1] || 'default';
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

const ImportCacheKey = /*@__PURE__*/ Symbol();

interface QDocument extends Document {
  [ImportCacheKey]?: Map<string, unknown | Promise<unknown>>;
}
