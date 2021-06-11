/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { Injector, Provider } from '../injector/types.js';
import { EventEntity } from './event_entity.js';

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
export function provideURL(): Provider<URL> {
  return async function urlProvider(injector: Injector): Promise<URL> {
    return (await injector.getEntity(EventEntity.KEY)).url;
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
export function provideUrlProp(parameterName: string): Provider<string | null> {
  return async function eventPropProvider(injector: Injector) {
    return (await injector.getEntity(EventEntity.KEY)).props[parameterName] || null;
  };
}
