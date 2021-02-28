/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export interface ConcreteType<T, ARGS extends any[]> extends Function {
  new (...args: ARGS): T;
}

export interface InjectableConcreteType<T, ARGS extends any[]> extends ConcreteType<T, ARGS> {
  resolver: AsyncProvider<T>;
}

export interface InjectionContext {
  host?: Element | null;
  element: Element | null;
  event?: Event | null;
  url?: URL | null;
  props?: { [key: string]: any } | null;
}

export type Provider<T> = (this: InjectionContext, ...args: any[]) => T;
export type AsyncProvider<T> = (this: InjectionContext, ...args: any[]) => T | Promise<T>;

export function isInjectableConcreteType(value: any): value is InjectableConcreteType<any, any> {
  return (
    typeof value === 'function' &&
    typeof (value as InjectableConcreteType<any, any>).resolver === 'function'
  );
}

export type ProviderReturns<ARGS extends any[]> = {
  [K in keyof ARGS]: ARGS[K] extends AsyncProvider<infer U> ? U : never;
};

export type InjectedFunction<SELF, ARGS extends any[], RET> = (
  this: SELF,
  ...args: ProviderReturns<ARGS>
) => RET;
