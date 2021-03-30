/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ComponentType, IComponent } from '../component/types.js';
import {
  IService,
  ServiceKey,
  ServicePromise,
  ServiceStateOf,
  ServiceType,
} from '../service/types.js';

/**
 * Interface for looking up components, services, properties from the DOM `Element`s.
 *
 * `Injector` is used as a look up context and factory for components, services and properties.
 * `Injector`s are marked with `:` attribute in the DOM. `Injector`s are responsible
 * for hydrating and serializing the state of the components and services.
 *
 * See: `injector.md`
 * @public
 */
export interface Injector {
  /**
   * `Element` with which this injector is associated with.
   *
   * For the `ElementInjector`, the `element` points to the element
   * for  which the `Injector` provides resolution.
   *
   * For the `EventInjector`, the `element` points to the `Element` which
   * received the event.
   */
  readonly element: Element;

  /**
   * Returns a parent `Injector`
   *
   * Injectors are attached to the DOM `Element`s. The `Injector` parent
   * is the closest injector following the DOM resolution rules.
   *
   * NOTE: If the DOM `Element` migrates locations it is possible for the
   * `Injector` to return different parents during its lifetime.
   */
  getParent(): Injector | null;

  /**
   * Resolve function parameters and than invoke the function.
   *
   * This method is intended to be used in conjunction with `inject()`.
   * The `inject()` specifies which providers should be provided to the
   * `fn` to satisfy its parameters.
   *
   * The providers can be asynchronous which is why `invoke` returns a promise.
   *
   * ```
   * const injectedFn = inject(
   *   ComponentOrServiceClass,
   *   provideSomething(),
   *   function(this: ComponentOrServiceClass, smt: Something) {
   *     return ...;
   *   }
   * );
   *
   * await injector.invoke(injectedFn);
   * ```
   *
   * @param fn - Function to resolve and invoke.
   * @param rest - Additional parameters to pass to function after the injected parameters.
   */
  invoke<SELF, PROVIDERS extends any[], REST extends any[], RET>(
    fn: InjectedFunction<SELF, PROVIDERS, REST, RET>,
    self?: SELF | null,
    ...rest: REST
  ): Promise<RET>;

  /**
   * Retrieves the closest component to the current `element`.
   *
   * Use this function for retrieving/materialize a component instance.
   * The function starts with the current `element` and walks up until it finds
   * an element with `AttributeMarker.ComponentTemplate` which matches the
   * `componentType.$templateQRL`. Once found it than tries to retrieve existing
   * component (or materialize it from the `AttributeMarker.ComponentState`).
   * Because creation of component may involve invoking `Component.$newState`
   * which is asynchronous the method itself is asynchronous.
   *
   * @param componentType - Component type to retrieve.
   */
  getComponent<COMP extends IComponent<any, any>>(
    componentType: ComponentType<COMP>
  ): Promise<COMP>;

  /**
   * Retrieves the Element Properties.
   *
   * The Element Properties are read from `Injector` or from the element
   * if the `Injector` does not have them.
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
   *      bind:id="propB;propC"
   *      :="ignore">
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
  elementProps: Props;

  /**
   * Retrieve a service for a given key.
   *
   * Retrieve the service from current or parent injector walking the DOM parents.
   * The injector starts with the current element and first looks for a serialized state
   * associated with the key. If not found it than looks for a factory definition on the same
   * element. If neither is found than the request is sent to the parent injector.
   *
   * ## Example
   *
   * Assume that `foo:123` has been requested and assume tha the search starts at `<child>`.
   * ```
   * <parent foo:123="{text: 'bar'}" :foo="qrlToFooService">
   *   <child bar:123 :bar="qrlToBarService"/>
   * </parent>
   * ```
   *
   * First injector looks at `<child>`, but neither `foo:123` nor `:foo` attribute can be found
   * so the injector delegates to `<parent>`. `<parent>` does have `foo:123` and so a service is
   * materialized. Injector reads the state from the `<parent>`'s `foo:123` attribute and class
   * from `:foo` property. It then `new`es up `Foo` class with deserialized `{text: 'bar'}` state.
   *
   * If `foo:432` is requested instead, then the process is repeated. The difference is that
   * once the injector gets to `<parent>` it can't find `foo:432` but it can retrieve `:foo`
   * which can be instantiated and then `Foo.$newState` can be invoke to compute the state.
   *
   * @param serviceKey - The key of state which should be retrieved.
   * @param state - Optional state which the service should be set to upon retrieval.
   * @param serviceType - Optional state type. If not provide the injector looks it up from the
   *        service `QRL` attribute.
   */
  getService<SERVICE extends IService<any, any>>(
    serviceKey: string,
    state?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceType<SERVICE>
  ): ServicePromise<SERVICE>;

  /**
   * Retrieve the service state for a given service key.
   *
   * This method behaves same as `getService` except it returns state only. The main advantage
   * of this method is that it is faster in the case when state can be deserialized from the DOM.
   * This is usually useful for render methods which don't need to mutate the state for rendering.
   *
   * @param serviceKey - The key of state which should be retrieved.
   */
  getServiceState<SERVICE extends IService<any, any>>(
    serviceKey: ServiceStateOf<SERVICE> | ServiceKey
  ): Promise<SERVICE>;
}

/**
 * Represents a class constructor.
 *
 * This type is often used when Qoot needs to refer to classes constructors.
 * @public
 */
export interface ConcreteType<T, ARGS extends any[] = [...any]> extends Function {
  new (...args: ARGS): T;
}

/**
 * A function returned by `inject` which contains provider information for that function.
 *
 * The function instance is same as the one which was passed into the inject with
 * provider information attached to the function which allows injector to invoke it.
 * @public
 */
export interface InjectedFunction<SELF, ARGS extends any[], REST extends any[], RET> {
  /**
   * A list of providers which are needed to satisfy the functions parameters.
   */
  $inject: Providers<ARGS>;

  /**
   * A type of `this` which needs to be passed in. This is used for error checking only.
   */
  $thisType: ConcreteType<SELF> | null;

  /**
   * Debug stack which points to where the `inject` was invoked. This is useful
   * for reporting errors. When the inject is invoked, if a provider throws an
   * error it is not clear where the provider was configured. This property does
   * provide the configuration information.
   */
  $debugStack?: Error;

  /**
   * Manual invocation of the function. (Useful mainly for tests)
   */
  (this: SELF, ...args: [...ARGS, ...REST]): RET;
}

/**
 * Interface describing a provider for `inject` function.
 *
 * A provider is a function which is invoked by the injector in order to satisfy the
 * injected functions parameters.
 *
 * There are many provider functions which come with Qoot, but it is expected that new
 * provider functions are created by the developer.
 *
 * ## Example of creating a provider
 *
 * ```
 * inject(
 *   provideGreeting('World'), // Assume we want to create providerGreeting
 *   function(greeting: string) {
 *     // Which injects a `string` => `Hello World';
 *     expect(greeting).to.equal('Hello World!');
 *   }
 * )
 *
 * // 1. As a convention all providers are named `provide_____`
 * // 2. As a convention a provider comes with a factory function which allows
 * //    configuration information to be passed in. In this case the `name` is
 * //    configurable.
 * // 3. Provider factories return `Provider<__ReturnType__>`.
 * function provideGreeting(name: string) {
 *   // 4. As a convention the provider function is called `____Provider`. The name
 *   //    is not strictly necessary but it makes stack traces cleaner, so it is strongly
 *   //    encouraged.
 *   return async function greetingProvider(injector: Injector) {
 *     // 5. You can use `injector` to retrieve other information useful for computing
 *     //    the result.
 *     // 6. The function can be `async` or sync. The injector will wait until all of the
 *     //    `Promise`s are resolved before the `InjectedFunction` is invoked.
 *     return `Hello ${name}!`;
 *   }
 * }
 * ```
 * @public
 */
export type Provider<T> = (injector: Injector) => T | Promise<T>;

export type ProviderReturns<ARGS extends any[]> = {
  [K in keyof ARGS]: ARGS[K] extends Provider<infer U> ? U : never;
};

export type Providers<ARGS extends any[]> = {
  [K in keyof ARGS]: Provider<ARGS[K]>;
};

export interface Props {
  // $: QProps;
  [key: string]: string | null | undefined;
}

export type ValueOrProviderReturns<ARGS extends any[]> = {
  [K in keyof ARGS]: ARGS[K] extends Provider<infer U> | infer U ? U : ARGS[K];
};
