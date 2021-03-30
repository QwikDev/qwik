/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { getClosestInjector } from '../injection/element_injector.js';
import { resolveArgs } from '../injection/resolve_args.js';
import { Injector, Provider } from '../injection/types.js';
import { IService } from './types.js';

/**
 * Provide a service for a given key.
 *
 * Provide the service from current or parent injector walking the DOM parents.
 * The injector starts with the current element and first looks for a serialized state
 * associated with the key. If not found it than looks for a factory definition on the same
 * element. If neither is found than the request is sent to the parent injector.
 *
 * ## Example
 *
 * Assume that `foo:123` has been requested and assume tha the search starts at `<child>`.
 * ```
 * <parent foo:123="{text: 'bar'}" :foo="qrlToFooService">
 *   <child bar:123 :bar="qrlToBarService"/>
 * </parent>
 * ```
 *
 * First injector looks at `<child>`, but neither `foo:123` nor `:foo` attribute can be found
 * so the injector delegates to `<parent>`. `<parent>` does have `foo:123` and so a service is
 * materialized. Injector reads the state from the `<parent>`'s `foo:123` attribute and class
 * from `:foo` property. It then `new`es up `Foo` class with deserialized `{text: 'bar'}` state.
 *
 * If `foo:432` is requested instead, then the process is repeated. The difference is that
 * once the injector gets to `<parent>` it can't find `foo:432` but it can retrieve `:foo`
 * which can be instantiated and then `Foo.$newState` can be invoke to compute the state.
 *
 * @param serviceKey - The key of state which should be retrieved.
 * @public
 */
export function provideService<SERVICE extends IService<any, any>>(
  id: string | Provider<string>
): Provider<SERVICE> {
  return async function resolveService(injector: Injector): Promise<SERVICE> {
    const elementInjector = getClosestInjector(injector.element);
    const [idResolved] = await resolveArgs(injector, id);
    return elementInjector.getService<SERVICE>(idResolved);
  };
}
