/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { getPlatform } from '../platform/platform';
import type { QRL } from './qrl';

/**
 * Lazy load a `QRL` symbol and returns the resulting value.
 *
 * @param element - Location of the URL to resolve against.
 * @param url - A relative URL (as `string` or `QRL`) or fully qualified `URL`
 * @returns A cached value synchronously or promise of imported value.
 * @public
 */
export async function qImport<T>(element: Element, qrl: QRL<T>): Promise<T> {
  if (qrl.symbolRef) return qrl.symbolRef;
  const doc = element.ownerDocument!;
  const corePlatform = getPlatform(doc);
  if (qrl.symbolFn) {
    return (qrl.symbolRef = qrl.symbolFn().then((module) => module[qrl.symbol]));
  } else {
    return (qrl.symbolRef = await corePlatform.importSymbol(element, qrl.chunk, qrl.symbol));
  }
}
