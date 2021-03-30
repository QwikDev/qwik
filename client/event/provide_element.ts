/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { EventInjector, EventProvider } from './types.js';

/**
 * Provide the event Element.
 *
 * The function provides element associated with the request.
 *
 * Assume this DOM
 * ```
 * <button on:click="./pathToHandler">Click me</button>
 * ```
 *
 * Then the `./pathToHandler` can be declared like so:
 * ```
 * export default injectEventHandler(
 *   null,
 *   provideElement(),
 *   function(element: Element) {
 *     expect(element).toEqual(<button>Click me</button>);
 *   }
 * }
 * ```
 * @public
 */
export function provideElement(): EventProvider<Element> {
  return function elementProvider(injector: EventInjector) {
    return injector.element;
  };
}
