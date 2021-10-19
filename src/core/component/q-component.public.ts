import { h } from '../render/jsx/factory';
import type { HTMLAttributes } from '../render/jsx/types/jsx-generated';
import type { FunctionComponent, JSXNode } from '../render/jsx/types/jsx-node';
import { AttributeMarker } from '../util/markers';
import type { QHook } from './qrl-hook.public';
import { QrlStyles, styleContent, styleHost } from './qrl-styles';

// <docs markdown="./q-component.md#qComponent">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
/**
 * Create a Qwik component that can be used in JSX.
 *
 * Use `qComponent` to declare a Qwik component. `QComponent` is a special kind of component that
 * allows the Qwik framework to lazy load and executed the component independently of other
 * `QComponent`s on the page as well as lazy load the `QComponent`s life-cycle hooks and event
 * handlers.
 *
 * Side note: You can also declare regular (standard JSX) components that will have standard
 * synchronous behavior.
 *
 * `QComponent` is a facade that describes how the component should be used without forcing the
 * implementation of the component to be eagerly loaded. The definition consists of:
 *
 * - Component definition (`qComponent`) a description of the public (props) and private (state)
 * interface of a component.
 * - a set of life-cycle hooks. (`onRender` is the only required hook).
 * - `tag`/`props`: an optional tag and props to be placed on the host element of the component.
 *
 * ### Example:
 *
 * Example showing how to create a counter component.
 *
 * ```typescript
 * export const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
 *   onMount: qHook((props) => ({ count: props.value || 0 })),
 *   onRender: qHook((props, state) => (
 *     <div>
 *       <span>{state.count}</span>
 *       <button
 *         on:click={qHook<typeof Counter>((props, state) => {
 *           state.count += props.step || 1;
 *         })}
 *       >
 *         +
 *       </button>
 *     </div>
 *   )),
 * });
 * ```
 *
 * - `qComponent` is how a component gets declared.
 * - `{ value?: number; step?: number }` declares the public (props) interface of the component.
 * - `{ count: number }` declares the private (state) interface of the component.
 * - `onMount`: is used to initialize the private state.
 * - `onRender`: is required hook for rendering the component.
 * - `qHook`: mark which parts of the component will be lazy-loaded. (see `qHook` for details.)
 *
 * The above can than be used like so:
 *
 * ```typescript
 * export const OtherComponent = qComponent({
 *   onRender: qHook(() => <Counter value={100} />),
 * });
 * ```
 *
 * @public
 */
// </docs>
export function qComponent<PROPS = {}, STATE = {}>({
  onRender,
  styles,
  tagName,
  props,
  onResume,
  onMount,
  onUnmount,
  onHydrate,
  onDehydrate,
}: {
  // <docs markdown="./q-component.md#qComponent.onRender">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A lazy-loadable `QHook` reference to a component's render hook.
   *
   * NOTE: This is the only required lifecycle hook for `QComponent`.
   *
   * ### Example
   *
   * ```typescript
   * const Counter = qComponent<{ name: string }>({
   *   onRender: qHook((props) => <div>{props.name}</div>),
   * });
   * ```
   */
  // </docs>
  onRender: QHook<PROPS, STATE, undefined, any>;

  // <docs markdown="./q-component.md#qComponent.tagName">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * HTML tag to be used for the component's host-element (defaults to `div`.)
   *
   * Component host-element must be inserted synchronously during rendering. However, the
   * component's view is inserted asynchronously. When inserting the host-element it usually looks
   * something like this:
   *
   * ```html
   * <div on:q-render="..." on:q-init="..." ...></div>
   * ```
   *
   * A lot of developers like to stick to `<div>` as the host element, but
   * one can choose any name they find helpful, such as `my-component`, to make
   * the DOM more readable.
   *
   * ```html
   * <my-component on:q-render="..." on:q-init="..." ...></my-component>
   * ```
   */
  // </docs>
  tagName?: string;

  // <docs markdown="./q-component.md#qComponent.onMount">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A lazy-loadable `QHook` reference to a component's initialization hook.
   *
   * `OnMount` is invoked when the component is first created and before the component is rendered.
   * `OnMount`s primary purpose is to create component's state. Typically the `OnRender` will use
   * the state for rendering.
   *
   * `OnMount` invokes on `QComponent` creation, but not after rehydration. When performing SSR,
   * the `OnMount` will invoke on the server because that is where the component is created. The
   * server then dehydrates the application and sends it to the client. On the client, the
   * `QComponent` may be rehydrated. Rehydration does not cause a second `OnMount` invocation.
   * (Only one invocation per component instance, regardless if the lifespan of the component
   * starts on the server and continues on the client.)
   *
   * NOTE: All lifecycle hooks can be synchronous or asynchronous.
   *
   * See: `OnMount` for details.
   *
   * ### Example
   *
   * ```typescript
   * const Counter = qComponent<{}, { count: number }>({
   *   onMount: qHook(() => ({ count: 0 })),
   *   onRender: qHook((props, state) => <div>{state.count}</div>),
   * });
   * ```
   */
  // </docs>
  onMount?: QHook<PROPS, undefined, undefined, STATE>;

  // <docs markdown="./q-component.md#qComponent.onUnmount">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A lazy-loadable `QHook` reference to a component's destroy hook.
   *
   * Invoked when the component is destroyed (removed from render tree).
   */
  // </docs>
  onUnmount?: QHook<PROPS, STATE, undefined, void> | null;

  // <docs markdown="./q-component.md#qComponent.onDehydrate">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A lazy-loadable `QHook` reference to a component's on dehydrate hook.
   *
   * Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows
   * the component to do last-minute clean-up before its state is serialized.
   */
  // </docs>
  onDehydrate?: QHook<PROPS, STATE, undefined, void> | null;

  // <docs markdown="./q-component.md#qComponent.onHydrate">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A lazy-loadable `QHook` reference to a component's on hydrate hook.
   *
   * Invoked when the component's state is re-hydrated from serialization. This allows the
   * component to do any work to re-activate itself.
   */
  // </docs>
  onHydrate?: QHook<PROPS, STATE, undefined, void> | null;

  // <docs markdown="./q-component.md#qComponent.onResume">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A lazy-loadable `QHook` reference to a component's on resume hook.
   *
   * The hook is eagerly invoked when the application resumes on the client. Because it is called
   * eagerly, this allows the component to hydrate even if no user interaction has taken place.
   */
  // </docs>
  onResume?: QHook<PROPS, STATE, undefined, void> | null;

  // <docs markdown="./q-component.md#qComponent.styles">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A lazy-loadable reference to a component styles.
   *
   * Component styles allow Qwik to lazy load the style information for the component only when
   * needed. (And avoid double loading it in case of SSR hydration.)
   */
  // </docs>
  // TODO(misko): finish documentation once implemented.
  styles?: QrlStyles<any>;

  // <docs markdown="./q-component.md#qComponent.props">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
  /**
   * A set of props to be automatically added to the host-element.
   *
   * Useful when the component needs to have a set of attributes present in the dom before the
   * `OnRender` executes.
   *
   * ### Example
   *
   * ```typescript
   * const MyComp = qComponent({
   *   props: { title: 'MyTitle', label: 'defaultLabel' },
   *   ...other,
   * });
   * ```
   *
   * When rendered as:
   *
   * ```html
   * <MyComp label="myLabel" name="World" />
   * ```
   *
   * Would result in:
   *
   * ```html
   * <my-comp label="myLabel" name="World" title="MyTitle"></my-comp>
   * ```
   *
   * Notice that `props` provides default values that will be auto-added to the component props
   * (unless the component instantiation props override them.)
   */
  // </docs>
  props?: PROPS;
}): QComponent<PROPS, STATE> {
  const QComponent: QComponent<PROPS, STATE> = function (jsxProps: PROPS): JSXNode<any> {
    return h(tagName || 'div', {
      [AttributeMarker.OnMount]: onMount,
      [AttributeMarker.OnRender]: onRender,
      [AttributeMarker.OnUnmount]: onUnmount,
      [AttributeMarker.OnHydrate]: onHydrate,
      [AttributeMarker.OnDehydrate]: onDehydrate,
      [AttributeMarker.ComponentStyles]: styles,
      ...props,
      ...jsxProps,
    });
  } as any;

  QComponent.onRender = onRender || null;
  QComponent.onResume = onResume || null;
  QComponent.onMount = onMount || null;
  QComponent.onUnmount = onUnmount || null;
  QComponent.onHydrate = onHydrate || null;
  QComponent.onDehydrate = onDehydrate || null;
  QComponent.styles = styles || null;
  QComponent.styleHostClass = styleHost(styles) || null;
  QComponent.styleClass = styleContent(styles) || null;
  return QComponent;
}

// <docs markdown="./q-component.md#QComponent">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./q-component.md instead)
/**
 * Defines `QComponent` type definition.
 *
 * `QComponent` is a type returned by the `qComponent` method and is used to verify type-safety
 * throughout the component definition.
 *
 * `QComponent` contains type information about:
 *
 * - `PROPS` public interfaces for props (to be used in `<MyComponent propA ...>`)
 * - `STATE` private state. This will be serialized into HTML on dehydration, therefore it must
 * be JSON serializable. (`OnRender` typically uses both `PROPS` and `STATE`.)
 *
 * ### Example
 *
 * A simple example with no `STATE` only `PROPS`
 *
 * ```typescript
 * export const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
 *   onMount: qHook((props) => ({ count: props.value || 0 })),
 *   onRender: qHook((props, state) => (
 *     <div>
 *       <span>{state.count}</span>
 *       <button
 *         on:click={qHook<typeof Counter>((props, state) => {
 *           state.count += props.step || 1;
 *         })}
 *       >
 *         +
 *       </button>
 *     </div>
 *   )),
 * });
 * ```
 *
 * The above allows one to use `Counter` like so:
 *
 * ```typescript
 * export const OtherComponent = qComponent({
 *   onRender: qHook(() => <Counter value={100} />),
 * });
 * ```
 *
 * ## Referring to types
 *
 * Normally `QComponent` is used in the application for type-safety as is. At times it is
 * required to refer to the types of `PROPS` and, `STATE`directly. In such a case, one can use
 * `PropsOf` and `StateOf`.
 *
 * See: `PropsOf`, `StateOf`.
 *
 * @public
 */
// </docs>
export interface QComponent<PROPS extends {} = any, STATE extends {} = any>
  extends FunctionComponent<PROPS & HTMLAttributes<HTMLElement>> {
  __brand__: 'QComponent';
  __type_PROPS__: PROPS;
  __type_STATE__: STATE;
  tag: string;
  onRender: QHook<PROPS, STATE, undefined, any>;
  onResume: QHook<PROPS, STATE, undefined, void> | null;
  onMount: QHook<PROPS, undefined, undefined, STATE> | null;
  onUnmount: QHook<PROPS, STATE, undefined, void> | null;
  onDehydrate: QHook<PROPS, STATE, undefined, void> | null;
  onHydrate: QHook<PROPS, STATE, undefined, void> | null;
  styles: QrlStyles<any> | null;
  styleClass: string | null;
  styleHostClass: string | null;
  props: Record<string, any>;
}

// <docs markdown="./props-of.md">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./props-of.md instead)
/**
 * Infers `Props` from `QComponent`.
 *
 * Given:
 *
 * ```
 * type MyComponent = qComponent<{propA: string}>({...});
 * ```
 *
 * Then:
 *
 * ```
 * const myProps: PropsOf<typeof MyComponent> = ...; // Same as `{propA: string}`
 * ```
 *
 * @public
 *
 */
// </docs>
export type PropsOf<ENTITY extends QComponent> = ENTITY extends QComponent<infer PROPS>
  ? PROPS
  : never;

// <docs markdown="./state-of.md">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit ./state-of.md instead)
/**
 * Infers `State` from `QComponent`.
 *
 * Given:
 *
 * ```
 * type MyComponent = qComponent<{}, {propA: string}>({...});
 * ```
 *
 * Then:
 *
 * ```
 * const myState: StateOf<typeof MyComponent> = ...; // Same as `{propA: string}`
 * ```
 *
 * @public
 *
 */
// </docs>
export type StateOf<ENTITY extends QComponent> = ENTITY extends QComponent<any, infer STATE>
  ? STATE
  : never;
