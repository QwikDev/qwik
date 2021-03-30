/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { EventInjector, EventProvider } from './types.js';

/**
 * Provide the event URL.
 *
 * The function provides URL associated with the request.
 *
 * Assume this DOM
 * ```
 * <button on:click="./pathToHandler?key=value">Click me</button>
 * ```
 *
 * Then the `./pathToHandler` can be declared like so:
 * ```
 * export default injectEventHandler(
 *   null,
 *   provideURL(),
 *   function(url: URL) {
 *     expect(url).toEqual('http://localhost/pathToHandler?key=value');
 *   }
 * }
 * ```
 */
export function provideURL(): EventProvider<URL> {
  return function urlProvider(injector: EventInjector) {
    return injector.url;
  };
}

/**
 * Provide the event URL property.
 *
 * The function provides URL associated with the request.
 *
 * Assume this DOM
 * ```
 * <button on:click="./pathToHandler?foo=bar">Click me</button>
 * ```
 *
 * Then the `./pathToHandler` can be declared like so:
 * ```
 * export default injectEventHandler(
 *   null,
 *   provideURLProp('foo'),
 *   function(value: string) {
 *     expect(value).toEqual('bar');
 *   }
 * }
 * ```
 * @param parameterName - URL parameter name to provide.
 * @public
 */
export function provideUrlProp(parameterName: string): EventProvider<string | null> {
  return function eventPropProvider(injector: EventInjector) {
    return injector.props[parameterName] || null;
  };
}
