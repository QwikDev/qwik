/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { getClosestInjector } from '../injection/element_injector.js';
import { AsyncProvider, Injector } from '../injection/types.js';
import { IService, ServiceStateOf } from './types.js';

// TODO: docs
// TODO: tests
// TODO: different file?
export function provideServiceState<SERVICE extends IService<any, any>>(
  id: string | AsyncProvider<string>
): AsyncProvider<ServiceStateOf<SERVICE>> {
  return async function resolveServiceState(injector: Injector): Promise<ServiceStateOf<SERVICE>> {
    const elementInjector = getClosestInjector(injector.element);
    const idResolved = await resolveProvider(injector, id);
    return elementInjector.getServiceState(idResolved);
  };
}

// TODO: docs
// TODO: tests
export function provideService<SERVICE extends IService<any, any>>(
  id: string | AsyncProvider<string>
): AsyncProvider<SERVICE> {
  return async function resolveService(injector: Injector): Promise<SERVICE> {
    const elementInjector = getClosestInjector(injector.element);
    const idResolved = await resolveProvider(injector, id);
    return elementInjector.getService<SERVICE>(idResolved);
  };
}
// TODO: this should be a more generic way of processing attributes
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
