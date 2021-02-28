/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertDefinedAndNotPromise, newError } from '../assert/index.js';
import { AsyncProvider, InjectionContext } from '../injection/types.js';
import { isPromise } from '../util/promises.js';
import '../util/qDev.js';
import { provideComponent } from './provide_component.js';
import { provideComponentState } from './provide_component_state.js';
import { provideProps } from './provide_props.js';
import { findHostElement } from './traversal.js';
import type { Component as IComponent, ComponentContext, ComponentType } from './types.js';

/**
 * Base class for Qoot component.
 *
 * All Qoot components need to inherit from this class. A Qoot component represents transient state
 * of component. A component contains `$state` and `$props` properties.
 *
 * Example:
 * ```
 * interface GreeterState {}
 * interface GreeterProps {
 *   salutation: string,
 *   name: string,
 * }
 *
 * class Greeter extends Component<GreeterProps, GreeterState> {
 *   $initState() {
 *     return {} as GreeterState;
 *   }
 * }
 * ```
 */
export class Component<P, S> implements IComponent<P, S> {
  /**
   * Component's host element.
   *
   * See HOST_ELEMENT.md for details
   */
  $host: Element;

  /**
   * Components serializable state.
   *
   * When application is de-hydrated only the component's state is serialized. For this reason
   * the state needs to contain all of the information necessary to rebuild the component.
   *
   * IMPORTANT: State must be JSON serializable!
   */
  $state: S;

  /**
   * Component's `Props`.
   *
   * Component is declared in the DOM like so `<MyComponent propA="valueA" ...>`. The attributes of
   * the component are it's properties and get converted int `Props` which is stored in this
   * property for convenience.
   */
  $props: P;

  /**
   * No Argument constructor.
   *
   * NOTE: It is important that this constructor does not take any arguments. Because components
   * subclass this base class it will not be possible to add arguments to this constructor. Doing
   * so would create breaking changes. For this reason this constructor takes no arguments and instead
   * uses side-channel to get its value. For this reason sub-classes of `Component` can't be
   * instantiated directly, as doing so will not set up the side-channel. Instead use `Component.new`
   */
  constructor() {
    const componentContext = _componentContext;
    if (!componentContext) {
      throw newError(
        `Components must be instantiated inside an injection context. Use '${
          this.constructor?.name || 'Component'
        }.new(...)' for creation.`
      );
    }
    _componentContext = null;
    this.$state = componentContext.state;
    this.$host = componentContext.host;
    this.$props = componentContext.props;
    if (this.$state === undefined) {
      this.$state = this.$initState(this.$props);
    }
  }

  /**
   * Lifecycle method to initialize component's state.
   *
   * When component is first created it has no state. Use this method to create initial component's
   * state. Once the component's state gets serialized to HTML and the component gets rehydrate
   * this method is no longer called.
   *
   * @param props
   */
  $initState(props: P): S {
    return null!;
  }

  ////////////////////
  // STATIC
  ////////////////////

  /**
   * Stores injection arguments for the `Component`.
   *
   * SEE: `injectConstructor`
   */
  static $inject: AsyncProvider<any>[] = [];

  /**
   * Used for instantiating component in tests.
   *
   * Component's must set up and retrieve `$props`, `$state` and `$host` These arguments can't be passed
   * in through constructor, as doing so would permanently fix what kind of arguments can be passe to
   * superclass. It would also make injecting `Component`'s wordy as one would always have to
   * inject side chanel as first argument. Instead side channel communication is used for passing
   * arguments to the `Component`
   *
   * This makes it not possible to create `Component`s with `new` keyword. Instead `MyComponent.new(..)`
   * is provided.
   *
   * Example:
   * ```
   * class Greeter extends Component<any, any> {
   *   static $inject = injectConstructor(
   *     provideSalutation(),
   *     Greeter
   *   );
   *   constructor(salutation: string) {}
   * }
   *
   * new Greeter('Hello'); // <-- throws Error.
   *
   * Greeter.new(componentContext, 'Hello'); // <-- WORKS!
   * ```
   *
   *
   * @param this `ComponentType` which should be instantiated.
   * @param componentContext Context which contains basic information which each component must have
   * @param args Args which match the `Component`s constructor arguments.
   */
  static new<T extends IComponent<P, S>, P, S, ARGS extends any[]>(
    this: ComponentType<IComponent<P, S>, ARGS>,
    componentContext: ComponentContext<P, S>,
    ...args: ARGS
  ): T {
    try {
      _componentContext = componentContext;
      return new this(...args) as any;
    } finally {
      _componentContext = null;
    }
  }

  /**
   * Instantiation component using the injection system.
   *
   * A component can declare that it needs to have its constructor instantiated
   * with dependencies. In such a case this method is used for component instantiation.
   *
   * Example:
   * ```
   * class Greeter extends Component<any, any> {
   *   static $inject = injectConstructor(
   *     provideSalutation(),
   *     Greeter
   *   );
   *   constructor(salutation: string) {}
   * }
   *
   * // Create new instance
   * const greeter = Greeter.newInject(injectionContext);
   * ```
   *
   *
   * @param this The `ComponentType` to instantiate. The dependencies need to be declared
   *     in `$inject`.
   * @param injectionContext `InjectionContext` to use for dependency resolution.
   */
  static newInject<T extends IComponent<P, S>, P, S, ARGS extends any[]>(
    this: ComponentType<IComponent<P, S>, ARGS>,
    injectionContext: InjectionContext
  ): T | Promise<T> {
    const $state = provideComponentState<S>(false).call(injectionContext);
    const $host = findHostElement(injectionContext);
    qDev && assertDefinedAndNotPromise($host);
    const $props = provideProps().apply(injectionContext);
    qDev && assertDefinedAndNotPromise($props);

    const componentInjectionContext: typeof _componentContext = {
      state: $state,
      host: $host,
      props: $props,
    };

    const args = [] as any;
    let hasPromise = false;
    this.$inject.forEach((injectResolver) => {
      const value = injectResolver.call(injectionContext);
      hasPromise = hasPromise || isPromise(value);
      args.push(value);
    });

    if (hasPromise) {
      // TODO: something is wrong with type system, any should not be necessary
      return Promise.all(args).then((args: any) =>
        this.new(componentInjectionContext, ...args)
      ) as any;
    } else {
      // TODO: something is wrong with type system, any should not be necessary
      return this.new(componentInjectionContext, ...args) as any;
    }
  }

  static get resolver(): AsyncProvider<any> {
    // TODO: something is wrong with type system, any should not be necessary
    return provideComponent(this as any);
  }
}

let _componentContext: ComponentContext<any, any> | null;
