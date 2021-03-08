/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { AsyncProvider, Injector } from '../injection/types.js';
import { retrieveService } from './retrieve_service.js';
import { retrieveState } from './retrieve_state.js';
import { Service } from './service.js';
import { IService, StateOf } from './types.js';

// TODO: docs
// TODO: tests
// TODO: different file?
export function provideServiceState<SERVICE extends IService<any, any>>(
  id: string | AsyncProvider<string>
): AsyncProvider<StateOf<SERVICE>> {
  return async function resolveServiceState(injector: Injector): Promise<StateOf<SERVICE>> {
    const idResolved = await resolveProvider(injector, id);
    return retrieveState(injector.element, idResolved);
  };
}

// TODO: docs
// TODO: tests
export function provideService<SERVICE extends Service<any, any>>(
  id: string | AsyncProvider<string>
): AsyncProvider<SERVICE> {
  return async function resolveService(injector: Injector): Promise<SERVICE> {
    const idResolved = await resolveProvider(injector, id);
    const service = retrieveService(injector.element, idResolved);
    return service as any;
  };
}
function resolveProvider<T>(
  injector: Injector,
  valueOrProvider: T | AsyncProvider<T>
): Promise<T> | T {
  if (isProvider(valueOrProvider)) {
    return valueOrProvider(injector);
  } else {
    return valueOrProvider;
  }
}
function isProvider(value: any): value is AsyncProvider<any> {
  return typeof value === 'function';
}
