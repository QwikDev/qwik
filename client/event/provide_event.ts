/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Injector, Provider } from '../injector/types.js';
import { EventEntity } from './event_entity.js';

/**
 * Provide the event.
 *
 * The function provides event associated with the request.
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
 *   provideEvent(),
 *   function(event: Event) {
 *     expect(event).toEqual({name: 'click', ...});
 *   }
 * }
 * ```
 * @public
 */
export function provideEvent(): Provider<Event> {
  return async function eventProvider(injector: Injector) {
    return (await injector.getEntity(EventEntity.KEY)).event;
  };
}
