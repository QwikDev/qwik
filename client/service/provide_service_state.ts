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
import { IService, ServiceStateOf } from './types.js';

/**
 * Provide the service state for a given service key.
 *
 * This provider behaves same as `provideService` except it returns state only. The main advantage
 * of this provider is that it is faster in the case when state can be deserialized from the DOM.
 * This is usually useful for render methods which don't need to mutate the state for rendering.
 *
 * @param serviceKey - The key of state which should be retrieved. (This can be another provider)
 * @public
 */
export function provideServiceState<SERVICE extends IService<any, any>>(
  id: string | Provider<string>
): Provider<ServiceStateOf<SERVICE>> {
  return async function resolveServiceState(injector: Injector): Promise<ServiceStateOf<SERVICE>> {
    const elementInjector = getClosestInjector(injector.element);
    const [idResolved] = await resolveArgs(injector, id);
    return elementInjector.getServiceState(idResolved);
  };
}
