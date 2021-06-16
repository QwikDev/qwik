/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { AttributeMarker } from '../util/markers.js';
import { getInjector } from '../injector/element_injector.js';
import { isHtmlElement } from '../util/types.js';

/**
 * Serialize the `Injector` state into the DOM.
 *
 * This function locates all of the injectors (which are child of `element`) and serializes their
 * state into the DOM. This prepares the DOM for dehydration.
 *
 *
 * @param element - `Element` (or `Document`) where injectors should be found and serialized.
 * @public
 */
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
