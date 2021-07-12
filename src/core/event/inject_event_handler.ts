/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { QRL } from '../import/qrl';
import type { InjectedFunction, ProviderReturns } from '../injector/types';
import { qDev } from '../util/qdev';
import { EventInjector } from './event_injector';
import type { EventHandler } from './types';

/**
 * Create an event handler with injected values.
 *
 * The function creates an `EventHandler` which is used by `qwikloader.js` to dispatch events.
 * The function supports passing in a component and providers.
 *
 * Creating an event handler. Assume an event is declared in template like so:
 * ```
 * <button on:click="./pathToHandler">Click me</button>
 * ```
 *
 * Then the `./pathToHandler` can be declared like so:
 * ```
 * export default injectEventHandler(
 *   MyComponent,
 *   provideEvent(),
 *   function(this: MyComponent, event: Event) {
 *     alert('Thanks for clicking me');
 *   }
 * );
 * ```
 *
 * @param args - a list consisting of Component type, zero or more providers and a handler function.
 * @returns A promise of handler function return.
 * @public
 */
export function injectEventHandler<SELF, ARGS extends any[], RET>(
  ...args: [
    {
      $templateQRL: QRL;
      new (hostElement: Element, props: any, state: any): SELF;
    } | null,
    ...ARGS,
    (this: SELF, ...args: [...ProviderReturns<ARGS>]) => RET
  ]
): EventHandler<SELF, ARGS, RET> {
  const injectedFunction = args.pop() as any as InjectedFunction<SELF, ARGS, [], RET>;
  const thisType = (injectedFunction.$thisType = args.shift() as any);
  injectedFunction.$inject = args as any;
  qDev && (injectedFunction.$debugStack = new Error());
  const eventHandler = function eventHandler(
    element: HTMLElement,
    event: Event,
    url: URL
  ): Promise<RET> {
    const eventInjector = new EventInjector(element, event, url);
    return Promise.resolve(
      (thisType && eventInjector.getParent()?.getComponent(thisType)) || null
    ).then((self) => eventInjector.invoke(injectedFunction as any, self));
  } as EventHandler<SELF, ARGS, RET>;
  eventHandler.$delegate = injectedFunction;
  return eventHandler;
}
