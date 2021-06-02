/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { qImportSet } from '../import/qImport.js';
import { AttributeMarker } from '../util/markers.js';
import { JSXFactory } from '../index.js';

let counter = 0;

/**
 * For testing it is useful to easily create components without going through complex
 * import setup.
 *
 * @param element Decorates element with `::` marking it as a component. It generates a QRL
 *   such that it would point to an import file whose exports are dynamically created.
 * @param factory The factory to attach to the export.
 */
export function componentize(element: Element, factory: JSXFactory) {
  const url = `//MOCK/_${counter++}`;
  element.setAttribute(AttributeMarker.ComponentTemplate, url);
  qImportSet(url, factory);
}
