/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {EventHandler} from './event_handler.js';
import {injectController, InjectFn} from './inject.js';

export function eventHandler<CTL>(arg: (this: CTL, ...args: string[]) => void):
    EventHandler;
export function eventHandler<CTL, A>(
    a: InjectFn<A>,
    arg: (this: CTL, a: A, ...args: string[]) => void): EventHandler;
export function eventHandler<CTL, A, B>(
    a: InjectFn<A>, b: InjectFn<B>,
    arg: (this: CTL, a: A, b: B, ...args: string[]) => void): EventHandler;
export function eventHandler<CTL, A, B, C>(
    a: InjectFn<A>, b: InjectFn<B>, c: InjectFn<C>,
    arg: (this: CTL, a: A, b: B, c: C, ...args: string[]) =>
        void): EventHandler;
export function eventHandler(...injectFns: Function[]): EventHandler {
  const eventHandlerFn = injectFns.pop();
  const _injectFns = injectFns as InjectFn<unknown>[];
  return async function(event: Event, target: Element, url: URL) {
    const args = await Promise.all([
      injectController<unknown>(event, target, url),
      ..._injectFns.map(fn => fn(event, target, url))
    ]);
    return eventHandlerFn?.apply(args.shift(), args);
  }
}