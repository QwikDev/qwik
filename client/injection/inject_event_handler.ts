/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { getBaseUri } from '../util/base_uri.js';
import '../util/qDev.js';
import { createEventInjector } from './element_injector.js';
import { convertTypesToProviders } from './inject.js';
import {
  AsyncProvider,
  EventHandler,
  InjectableConcreteType,
  InjectedFunction,
  ProviderReturns,
} from './types.js';

// TODO: docs
// TODO: tests
// TODO: move to different file
export function injectEventHandler<SELF, ARGS extends any[], RET>(
  ...args: [
    AsyncProvider<SELF> | InjectableConcreteType<SELF, any[]> | null,
    ...ARGS,
    (this: SELF, ...args: [...ProviderReturns<ARGS>]) => RET
  ]
): EventHandler<SELF, ARGS, RET> {
  const injectedFunction = (args.pop() as any) as InjectedFunction<SELF, ARGS, [], RET>;
  injectedFunction.$inject = convertTypesToProviders<SELF, ARGS>(args);
  qDev && (injectedFunction.$debugStack = new Error());
  const eventHandler = function eventHandler(
    element: HTMLElement,
    event: Event,
    url: URL
  ): boolean {
    createEventInjector(element, event, url).invoke(injectedFunction);
    return false;
  } as EventHandler<SELF, ARGS, RET>;
  eventHandler.$delegate = injectedFunction;
  return eventHandler;
}
