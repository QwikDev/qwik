/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { InjectionContext } from '../injection/types.js';
import { assertDefined, newError } from '../assert/index.js';

export function findHostElement(context: InjectionContext): Element {
  qDev && assertDefined(context);
  const host = context.host;
  if (host) return host;
  let cursor: Element | null = context.element || null;
  while (cursor && !cursor.hasAttribute('::')) {
    cursor = cursor.parentElement;
  }
  if (!cursor) {
    throw newError("Can't find host element.");
  }
  return (context.host = cursor);
}
