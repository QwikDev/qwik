/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { EntityKey } from '../entity/entity_key.js';
import { getClosestInjector } from '../injector/element_injector.js';
import { resolveArgs } from '../injector/resolve_args.js';
import { Injector, Provider } from '../injector/types.js';
import { Entity, EntityStateOf } from '../entity/entity.js';

/**
 * Provide the entity state for a given entity key.
 *
 * This provider behaves same as `provideEntity` except it returns state only. The main advantage
 * of this provider is that it is faster in the case when state can be deserialized from the DOM.
 * This is usually useful for render methods which don't need to mutate the state for rendering.
 *
 * @param entityKey - The key of state which should be retrieved. (This can be another provider)
 * @public
 */
export function provideEntityState<SERVICE extends Entity<any, any>>(
  id: EntityKey<SERVICE> | Provider<EntityKey<SERVICE>>
): Provider<EntityStateOf<SERVICE>> {
  return async function resolveEntityState(injector: Injector): Promise<EntityStateOf<SERVICE>> {
    const elementInjector = getClosestInjector(injector.element);
    const [idResolved] = await resolveArgs(injector, id);
    return elementInjector.getEntityState(idResolved);
  };
}
