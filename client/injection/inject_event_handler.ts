/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import '../util/qDev.js';
import { EventInjector } from './event_injector.js';
import { EventHandler, InjectedFunction, ProviderReturns, ConcreteType } from './types.js';

// TODO: docs
// TODO: tests
// TODO: move to different file
export function injectEventHandler<SELF, ARGS extends any[], RET>(
  ...args: [
    ConcreteType<SELF> | null,
    ...ARGS,
    (this: SELF, ...args: [...ProviderReturns<ARGS>]) => RET
  ]
): EventHandler<SELF, ARGS, RET> {
  const injectedFunction = (args.pop() as any) as InjectedFunction<SELF, ARGS, [], RET>;
  const thisType = (injectedFunction.$thisType = args.shift() as any);
  injectedFunction.$inject = args as any;
  qDev && (injectedFunction.$debugStack = new Error());
  const eventHandler = function eventHandler(
    element: HTMLElement,
    event: Event,
    url: URL
  ): boolean {
    const eventInjector = new EventInjector(element, event, url);
    Promise.resolve(
      (thisType && eventInjector.getParent()?.getComponent(thisType)) || null
    ).then((self) => eventInjector.invoke(injectedFunction as any, self));
    return false;
  } as EventHandler<SELF, ARGS, RET>;
  eventHandler.$delegate = injectedFunction;
  return eventHandler;
}
