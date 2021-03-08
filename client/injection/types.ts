/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export interface ConcreteType<T, ARGS extends any[] = []> extends Function {
  new (...args: ARGS): T;
}

export interface InjectableConcreteType<T, ARGS extends any[]> extends ConcreteType<T, ARGS> {
  $resolver: AsyncProvider<any>;
}

export interface Injector {
  readonly element: Element;
  readonly props: Props;
  //readonly url: URL | null;
  //readonly event: Event | null;

  //readonly host: Element;

  /**
   * Retrieves the Component Properties.
   *
   * The Component Properties are read from `InjectionContext` or from the host-element
   * if the `InjectionContext` does not have them.
   *
   * The attributes follow these rules:
   * - all attributes which contain `:` are ignored as these are control attributes and
   *   never part of bindings.
   * - All property keys are translated from kebab to camel case (with first char being
   *   lowercase)
   * - `bind:` properties are stored reversed. (Binding id is stored in attribute key and
   *   binding property is stored in attribute value. [Reason: so that Qoot can use
   *   `querySelectAll` to find all binding ids in case of an update.])
   *
   * Example
   * ```
   * <div prop-a="ValueA"
   *       bind:id="propB;propC"
   *       :="ignore">
   * ```
   * Results in:
   * ```
   * {
   *   propA: 'ValueA',
   *   propB: 'id',
   *   propC: 'id',
   * }
   * ```
   */
  //readonly hostProps: Props;

  invoke<SELF, PROVIDERS extends any[], REST extends any[], RET>(
    fn: InjectedFunction<SELF, PROVIDERS, REST, RET>,
    ...args: REST
  ): Promise<RET>;
}

export interface InjectedFunction<SELF, ARGS extends any[], REST extends any[], RET> {
  $inject: AsyncProviders<[SELF, ...ARGS]>;
  $debugStack?: Error;
  (this: SELF, ...args: [...ARGS, ...REST]): RET;
}

export type AsyncProvider<T> = (injectionContext: Injector) => T | Promise<T>;

export function isInjectableConcreteType(value: any): value is InjectableConcreteType<any, any> {
  return (
    typeof value === 'function' &&
    typeof (value as InjectableConcreteType<any, any>).$resolver === 'function'
  );
}

export type ProviderReturns<ARGS extends any[]> = {
  [K in keyof ARGS]: ARGS[K] extends AsyncProvider<infer U> ? U : never;
};

export type AsyncProviders<ARGS extends any[]> = {
  [K in keyof ARGS]: AsyncProvider<ARGS[K]>;
};

export interface EventHandler<SELF, ARGS extends any[], RET> {
  (element: HTMLElement, event: Event, url: URL): boolean;
  $delegate: InjectedFunction<SELF, ARGS, [], RET>;
}

export interface Props {
  // $: QProps;
  [key: string]: string | null | undefined;
}
