/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectComponent } from './inject_component.js';
import { isPromise } from '../util/promises.js';

export interface InjectionContext {
  host?: Element | null;
  element: Element | null;
  event?: Event | null;
  url?: URL | null;
  // TODO: we need a type here, but JSXProps is too JSX specific
  props?: {} | null;
}

export type InjectedFunction<T> = (this: InjectionContext, ...args: any[]) => T;
export type AsyncInjectedFunction<T> = (this: InjectionContext, ...args: any[]) => T | Promise<T>;

/**
 * An event handler associated with a component.
 *
 * @param args Takes a list of `async` functions. The 0 through n-1 functions compute a value
 *   and the last function is invoked as a handler with the compute value. The last function
 *   is invoked with `this` pointing to the transient component state.
 */
export function inject<RET, SELF>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  injectedHandler: (this: SELF) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  injectedHandler: (this: SELF, a: A) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  injectedHandler: (this: SELF, a: A, b: B) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  injectedHandler: (this: SELF, a: A, b: B, c: C) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C, D>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  d: AsyncInjectedFunction<D>,
  injectedHandler: (this: SELF, a: A, b: B, c: C, d: D) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C, D, E>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  d: AsyncInjectedFunction<D>,
  e: AsyncInjectedFunction<E>,
  injectedHandler: (this: SELF, a: A, b: B, c: C, d: D, e: E) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C, D, E, F>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  d: AsyncInjectedFunction<D>,
  e: AsyncInjectedFunction<E>,
  f: AsyncInjectedFunction<F>,
  injectedHandler: (this: SELF, a: A, b: B, c: C, d: D, e: E, f: F) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C, D, E, F, G>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  d: AsyncInjectedFunction<D>,
  e: AsyncInjectedFunction<E>,
  f: AsyncInjectedFunction<F>,
  g: AsyncInjectedFunction<G>,
  injectedHandler: (this: SELF, a: A, b: B, c: C, d: D, e: E, f: F, g: G) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C, D, E, F, G, H>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  d: AsyncInjectedFunction<D>,
  e: AsyncInjectedFunction<E>,
  f: AsyncInjectedFunction<F>,
  g: AsyncInjectedFunction<G>,
  h: AsyncInjectedFunction<H>,
  injectedHandler: (this: SELF, a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C, D, E, F, G, H, I>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  d: AsyncInjectedFunction<D>,
  e: AsyncInjectedFunction<E>,
  f: AsyncInjectedFunction<F>,
  g: AsyncInjectedFunction<G>,
  h: AsyncInjectedFunction<H>,
  i: AsyncInjectedFunction<I>,
  injectedHandler: (this: SELF, a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I) => RET
): AsyncInjectedFunction<RET>;
export function inject<RET, SELF, A, B, C, D, E, F, G, H, I, J>(
  self: ComponentType<SELF, any[]> | AsyncInjectedFunction<SELF> | null,
  a: AsyncInjectedFunction<A>,
  b: AsyncInjectedFunction<B>,
  c: AsyncInjectedFunction<C>,
  d: AsyncInjectedFunction<D>,
  e: AsyncInjectedFunction<E>,
  f: AsyncInjectedFunction<F>,
  g: AsyncInjectedFunction<G>,
  h: AsyncInjectedFunction<H>,
  i: AsyncInjectedFunction<I>,
  j: AsyncInjectedFunction<J>,
  injectedHandler: (this: SELF, a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J) => RET
): AsyncInjectedFunction<RET>;
export function inject(...functions: (Function | null)[]): AsyncInjectedFunction<unknown> {
  const method = functions.pop()!;
  const injectResolvers = functions as Array<
    AsyncInjectedFunction<unknown> | ComponentType<any, any>
  >;

  return function injectResolve(this: InjectionContext, ...additionalArgs: any[]) {
    const injectedArgs: unknown[] = [];
    let hasPromises = false;
    for (let i = 0; i < injectResolvers.length; i++) {
      let resolver = injectResolvers[i];
      if (isComponentType(resolver)) {
        resolver = injectComponent(resolver);
      }
      const resolvedValue = resolver === null ? resolver : resolver.call(this);
      injectedArgs.push(resolvedValue);
      if (!hasPromises && isPromise(resolvedValue)) {
        hasPromises = true;
      }
    }

    return hasPromises
      ? Promise.all(injectedArgs).then(function injectArgsResolve(injectedArgs: unknown[]) {
          return method.call(injectedArgs.shift(), ...injectedArgs, ...additionalArgs);
        })
      : method.call(injectedArgs.shift(), ...injectedArgs, ...additionalArgs);
  };
}

export function isComponentType(value: any): value is ComponentType<any, any> {
  return (
    typeof value === 'function' &&
    typeof (value as ComponentType<any, any>).newInject === 'function'
  );
}

export interface ConcreteType<T, ARGS extends any[]> extends Function {
  new (...args: ARGS): T;
}

export interface ComponentType<T, ARGS extends any[]> extends ConcreteType<T, ARGS> {
  $inject: ARGS;
  new (...args: ARGS): T;
  newInject(injectionContext: InjectionContext): T | Promise<T>;
}

export function injectConstructor<A0, A1>(
  a0: AsyncInjectedFunction<A0>,
  a1: AsyncInjectedFunction<A1>,
  type: ConcreteType<any, [A0, A1]>
): [AsyncInjectedFunction<A0>, AsyncInjectedFunction<A1>];
export function injectConstructor<A0>(
  a0: AsyncInjectedFunction<A0>,
  type: ConcreteType<any, [A0]>
): [AsyncInjectedFunction<A0>];
export function injectConstructor(type: ConcreteType<unknown, []>): [];
export function injectConstructor(...args: Function[]): AsyncInjectedFunction<unknown>[] {
  args.pop(); // Ignore the last one as that is the component type.
  return args as any;
}
