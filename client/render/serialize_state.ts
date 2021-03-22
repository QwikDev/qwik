/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { AttributeMarker } from '../util/markers.js';
import { getInjector } from '../injection/element_injector.js';
import { isHtmlElement } from '../util/types.js';

// TODO: test
// TODO: docs
export function serializeState(element: Element | Document) {
  if (isHtmlElement(element)) {
    serializeNode(element);
  }
  element.querySelectorAll(AttributeMarker.InjectorSelector).forEach(serializeNode);
}
function serializeNode(element: Element): void {
  const injector = getInjector(element, false);
  if (injector) {
    injector.serialize();
  }
}
