/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from '../import/qrl.js';
import { QError, qError } from '../error/error.js';
import '../util/qDev.js';
import { AttributeMarker } from '../util/markers.js';
import { getInjector } from '../injector/element_injector.js';

/**
 * Base class for Qoot component.
 *
 * All Qoot components are defined by a class that must inherit from `Component`.
 * An instance of a Qoot component represents the transient state of that component.
 * A component contains `$state` and `$keyProps` properties.
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
 *   $newState() {
 *     return {} as GreeterState;
 *   }
 * }
 * ```
 * @public
 */
export class Component<PROPS, STATE> {
  /**
   * Pointer to template to verify that the component is attached to the right DOM location.
   */
  static $templateQRL: QRL = null!;

  static $new<COMP extends Component<any, any>>(
    this: {
      $templateQRL: QRL;
      new (...args: any[]): COMP;
    },
    hostElement: Element
  ): Promise<COMP> {
    // TODO: Needs tests
    const componentConstructor = (this as any) as ComponentConstructor<COMP>;
    const componentTemplate = hostElement.getAttribute(AttributeMarker.ComponentTemplate);
    if (!componentTemplate) {
      hostElement.setAttribute(
        AttributeMarker.ComponentTemplate,
        componentConstructor.$templateQRL as any
      );
    } else if (componentTemplate !== (componentConstructor.$templateQRL as any)) {
      // TODO: Needs tests for error condition for attaching component to element  which already has a component
      throw new Error('Write proper error');
    }
    const injector = getInjector(hostElement);
    return injector.getComponent(componentConstructor);
  }

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
  $state: STATE;

  /**
   * Component's `Props`.
   *
   * Component is declared in the DOM like so `<MyComponent propA="valueA" ...>`. The attributes of
   * the component are it's properties and get converted int `Props` which is stored in this
   * property for convenience.
   */
  $props: PROPS;

  constructor(hostElement: Element, props: PROPS, state: STATE | null) {
    this.$host = hostElement;
    this.$props = props;
    this.$state = state!;
  }

  /**
   * Lifecycle method invoked on hydration.
   *
   * After the component creation and after the state is restored (either from DOM or by invoking
   * `$newState`) this method is invoked. The purpose of this method is to allow the component
   * to compute any transient state.
   *
   * Lifecycle order:
   * - `new Component(...)`
   * - `$newState(props)`: Invoked if no serialized state found in DOM.
   * - `$init()`
   * - Component returned by the `Injector`.
   */
  $init(): Promise<void> | void {}

  /**
   * Lifecycle method to initialize a component's state.
   *
   * When component is first created it has no state. Use this method to create the component's
   * initial state from the `Props`.
   *
   * Once the component's state gets serialized to HTML and the component gets rehydrated this
   * method is no longer called.
   *
   * Lifecycle order:
   * - `new Component(...)`
   * - `$newState(props)`: Invoked if no serialized state found in DOM.
   * - `$init()`
   * - Component returned by the `Injector`.
   *
   * @param props - Component props.
   */
  $newState(props: PROPS): Promise<STATE> | STATE {
    const componentType = this.constructor as typeof Component;
    throw qError(QError.Component_noState_component_props, componentType, props);
  }
}

/**
 * Return `State` of `Component` Type.
 *
 * Given:
 * ```
 * class Greeter extends Component<GreeterProps, GreeterState> {
 *   ...
 * }
 * ```
 * Then `ComponentStateOf<Greeter>` will return `GreeterState` type.
 *
 * @public
 */
export type ComponentStateOf<SERVICE extends Component<any, any>> = SERVICE extends Component<
  any,
  infer STATE
>
  ? STATE
  : never;

/**
 * Return `Props` of `Component` Type.
 *
 * Given:
 * ```
 * class Greeter extends Component<GreeterProps, GreeterState> {
 *   ...
 * }
 * ```
 * Then `ComponentPropsOf<Greeter>` will return `GreeterProps` type.
 *
 * @public
 */
export type ComponentPropsOf<SERVICE extends Component<any, any>> = SERVICE extends Component<
  infer PROPS,
  any
>
  ? PROPS
  : never;

/**
 * Component Constructor.
 *
 * Given:
 * ```
 * class Greeter extends Component<GreeterProps, GreeterState> {
 *   ...
 * }
 * ```
 * Then `ComponentConstructor<Greeter>` will return type which is compatible with `Greeter`.
 *
 *
 * @public
 */
export interface ComponentConstructor<COMP extends Component<any, any>> {
  $templateQRL: QRL;
  new (
    hostElement: Element,
    props: ComponentPropsOf<COMP>,
    state: ComponentStateOf<COMP> | null
  ): COMP;
}

/**
 * Determines if an `object` is an instance of `Component`.
 *
 * @internal
 */
export function isComponent(object: any): object is Component<any, any> {
  return typeof object?.constructor?.$templateQRL === 'string';
}
