/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertDefined } from '../assert/assert.js';
import { getStorage } from '../injection/storage.js';
import { isHtmlElement } from '../util/types.js';

export function serializeState(element: Element | Document) {
  if (isHtmlElement(element)) {
    serializeNode(element);
  }
  element.querySelectorAll('[\\:]').forEach(serializeNode);
  // TODO: Unify service/components;
  element.querySelectorAll('[\\:\\:]').forEach(serializeNode);
}
function serializeNode(element: Element): void {
  const storage = getStorage(element, false);
  if (storage) {
    storage.forEach((injector, key) => {
      if (injector.instance) {
        element.setAttribute(key, JSON.stringify(injector.instance.$state));
      }
    });
  }
}
