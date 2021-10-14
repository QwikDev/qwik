import { h } from '../render/jsx/factory';
import type { HTMLAttributes } from '../render/jsx/types/jsx-generated';
import type { FunctionComponent, JSXNode } from '../render/jsx/types/jsx-node';
import { AttributeMarker } from '../util/markers';
import type { QHook } from './qrl-hook.public';
import { QrlStyles, styleContent, styleHost } from './qrl-styles';

/**
 * Create Qwik component which can be used in JSX.
 *
 * Use `qComponent` to declare a Qwik component. `QComponent` is a special kind of component
 * that allow the Qwik framework to lazy load and executed the component independently of other
 * `QComponent`s on the page as well as lazy load the `QComponent`s life-cycle hooks.
 *
 * Side note: You can also declared regular (standard JSX) components which will have standard
 * synchronous behavior.
 *
 * `QComponent` is a facade which describes how the component should be used
 * without forcing the implementation of the component to be eagerly loaded. `QComponent`
 * definition consists of:
 * - type definition (`QComponent`): A type describing the public (and private) interface of the
 *   component.
 * - a set of lifecycle hooks. (`onRender` is the only required hook).
 * - `tag`/`props`: an optional tag and props to be placed on the host element of the component.
 *
 * Creating component consists of:
 * - defining the type for type safety.
 * - defining the component hooks (`onMount`, `onRender`, etc..).
 *   - required `onRender` hook may require other event handlers.
 *
 * ### Example:
 *
 * Example showing how to create a counter component.
 *
 * ```typescript
 * export type Counter = QComponent<
 *   // PROPS: Public props: `<Counter value={10} step={5}/>`
 *   { value?: number; step?: number },
 *   // STATE: Private state of component
 *   { count: number }
 * >;
 *
 * export const onMount = qrlOnMount<Counter>(({ props }) => ({ count: props.value || 0 }));
 *
 * export const onRender = qrlOnRender<Counter>(({ state }) => (
 *   <div>
 *     <button on:click={update.with({ direction: -1 })}>-</button>
 *     <span>{state.count}</span>
 *     <button on:click={update.with({ direction: +1 })}>+</button>
 *   </div>
 * ));
 *
 * export const update = qrlHandler<Counter, { direction: number }>(
 *   //
 *   ({ props, state, params }) => {
 *     state.count += params.direction * (props.step || 1);
 *   }
 * );
 *
 * export const Counter = qComponent<Counter>({ onMount, onRender });

 * ```
 *
 * The above can than be used like so:
 * ```typescript
 * export const otherOnRender = qrlOnRender<OtherComponent>(() => (
 *   <Counter value={100} />
 * ));
 * ```
 * @public
 */
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
  /**
   * A lazy-loadable `QHook` reference to a component's render hook.
   *
   * NOTE: This is the only required lifecycle hook for `QComponent`.
   *
   * See: `OnRender` for details
   *
   * ### Example
   *
   * ```typescript
   * export type Greeter = QComponent<{ name?: string }, { salutation: string }>;
   * export const onMount = qrlOnMount<Greeter>(() => ({ salutation: 'Hello' }));
   * export const onRender = qrlOnRender<Greeter>(({ props, state }) => (
   *   <span>
   *     {state.salutation} {props.name || 'World'}!
   *   </span>
   * ));
   * export const Greeter = qComponent({ onMount, onRender });
   * ```
   */
  onRender: QHook<PROPS, STATE, undefined, any>;
  /**
   * HTML tag to be used for the component's host-element (defaults to `div`.)
   *
   * Component host-element must be inserted synchronously during rendering,
   * but the component's view can be inserted asynchronously. When inserting
   * the host-element it usually looks something like this:
   *
   * ```html
   * <div on:q-render="..." on:q-init="..." ...>
   * ```
   *
   * A lot of developers like to stick to `<div>` as the host element, but
   * one can chose any name they find useful, such as `my-component` to make
   * the DOM more readable.
   *
   * ```html
   * <my-component on:q-render="..." on:q-init="..." ...>
   * ```
   */
  tagName?: string;
  /**
   * A lazy-loadable `QHook` reference to a component's initialization hook.
   *
   * `OnMount` is invoked when the component is first created
   * and before the component is rendered. `OnMount`s primary
   * purpose is to create component's state. Typically
   * the `OnRender` will use the state for rendering.
   *
   * `OnMount` invokes on `QComponent` creation, but not after
   * rehydration. When performing SSR the `OnMount` will invoke
   * on server because that is where the component is created. The server
   * than dehydrates the application and sends it to the client. On the client
   * the `QComponent` may be rehydrated. Rehydration does not cause second
   * `OnMount` invocation. (Only one invocation per component instance,
   * regardless if the lifespan of the component starts on the server and continues
   * on the client.)
   *
   * NOTE: All lifecycle hooks can be asynchronous.
   *
   * See: `OnMount` for details.
   *
   * ### Example
   *
   * ```typescript
   * export type Counter = QComponent<{}, { count: number }>;
   * export const onMount = qrlOnMount<Counter>(() => ({ count: 0 }));
   * export const onRender = qrlOnRender<Counter>(({ state }) => <div>{state.count}</div>);
   * export const Counter = qComponent({ onMount, onRender });
   * ```
   */
  onMount?: QHook<PROPS, undefined, undefined, STATE>;

  /**
   * A lazy-loadable `QHook` reference to a component's on destroy hook.
   *
   * Invoked when the component is destroyed (removed from render tree).
   */
  onUnmount?: QHook<PROPS, STATE, undefined, void> | null;
  /**
   * A lazy-loadable `QHook` reference to a component's on dehydrate hook.
   *
   * Invoked when the component's state is being serialized (dehydrated)
   * into the DOM. This allows the component to do last minute clean-up
   * before it's state is serialized.
   */
  onDehydrate?: QHook<PROPS, STATE, undefined, void> | null;
  /**
   * A lazy-loadable `QHook` reference to a component's on hydrate hook.
   *
   * Invoked when the component's state is re-hydrated from serialization.
   * This allows the component to do any work to re-activate itself.
   */
  onHydrate?: QHook<PROPS, STATE, undefined, void> | null;
  onResume?: QHook<PROPS, STATE, undefined, void> | null;
  /**
   * A lazy-loadable `QHook` reference to a component styles.
   *
   * Component styles allow Qwik to lazy load the style information for
   * the component only when needed. (And avoid double loading it in case
   * of SSR hydration.)
   *
   * See: `qrlStyles` for details.
   */
  // TODO(misko): finish documentation once implemented.
  styles?: QrlStyles<any>;
  /**
   * A set of props to be automatically added to the host-element.
   *
   * Useful when the component needs to have a set of attributes present
   * in the dom before the `OnRender` executes.
   *
   * ### Example
   * ```typescript
   * export const MyComp = qComponent({
   *   props: {title: 'MyTitle', label: 'defaultLabel'},
   *   ...other
   * });
   * ```
   * When rendered as:
   * ```html
   * <MyComp label="myLabel" name="World"/>
   * ```
   *
   * Would result in:
   * ```html
   * <my-comp label="myLabel" name="World" title="MyTitle">
   * ```
   *
   * Notice that `props` provides default values which will be auto-added
   * to the component props (unless they are overridden by the component
   * instantiation props.)
   */
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

/**
 * Defines `QComponent` type definition.
 *
 * Use `QComponent` to create a component type which is than used to verify type-safety
 * throughout the component definition.
 *
 * A basic layout of declaring a `QComponent` involves:
 * - `PROPS` public interfaces for props (to be used in `<MyComponent propA ...>`)
 * - `STATE` private state. This will be serialized into HTML on dehydration, therefore it
 *   must be JSON serializable. (`OnRender` typically uses both `PROPS` and `STATE`.)
 *
 * ### Example
 * A simple example with no `STATE` only `PROPS`
 * ```typescript
 * export type Greet = QComponent<{ name: string }>;
 * export const onRender = qrlOnRender<Greet>(({ props }) => (
 *   <span>Hello {props.name}</span>
 * ));
 * export const Greet = qComponent({ onRender });
 * ```
 *
 * The above allows one to use `Greet` like so:
 * ```typescript
 * const otherOnRender = qrlOnRender<OtherComponent>(() => (
 *   <Greet name="World" />
 * ));
 * ```
 *
 * A more complex example using transient state:
 *
 * ```typescript
 * interface StockProps {
 *   stock: string; // Stock ticker symbol
 * }
 * interface StockState {
 *   price: number; // Last price in cents
 * }
 * interface StockTransient {
 *   tickerStream: Socket; // Streaming service delivering stock prices
 * }
 * type Stock = QComponent<StockProps, StockState, StockTransient>;
 * function createTransientState(component: Stock): TransientOf<Stock> {
 *   return {
 *     tickerStream: someCodeToConnectToServer(component.props.stock, (price) => {
 *       // Writing to state will automatically schedule component for rendering.
 *       component.state!.price = price;
 *     }),
 *   };
 * }
 * const onMount = qrlOnMount<Stock>(({ self }) => {
 *   self.transient = createTransientState(self);
 *   return { price: 0 };
 * });
 * const onHydrate = qrlOnHydrate<Stock>(({ self }) => createTransientState(self));
 * const onRender = qrlOnRender<Stock>(({ props, state }) => (
 *   <span>
 *     Stock {props.stock} {state.price} (cents)
 *   </span>
 * ));
 * const Stock = qComponent<Stock>({ onMount, onRender, onHydrate });
 * ```
 *
 * A typical component with internal state, handlers but no transient state:
 * ```typescript
 * type Counter = QComponent<{ initial: number }, { count: number }>;
 * const onMount = qrlOnMount<Counter>(({ props }) => ({
 *   count: props.initial || 0,
 * }));
 * const onRender = qrlOnRender<Counter>(({ state }) => (
 *   <div>
 *     <button on:click={update.with({ value: -1 })}>-</button>
 *     <span>{state.count}</span>
 *     <button on:click={update.with({ value: +1 })}>+</button>
 *   </div>
 * ));
 * const update = qrlHandler<Counter, { value: number }>(({ state, params }) => {
 *   state.count += params.value;
 * });
 * const Counter = qComponent({ onMount, onRender });
 * ```
 *
 * ## Referring to types
 *
 * Normally we user tho `QComponent` type in our application for type-safety as is. At times
 * it is required to refer to the types of `PROPS`, `STATE` and `TRANSIENT` directly. In such
 * a case one can use `PropsOf`, `StateOf` and `TransientOf` respectively.
 *
 * See: `qrlOnRender`, `qrlOnMount`, `PropsOf`, `StateOf`, `TransientOf`.
 *
 * @public
 */
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

/**
 * Describes  component lifecycle hooks.
 *
 * In typical development when discussing object lifespan, it is clear that objects either
 * exists or they don't. Either on object has been instantiated or it has not yet been
 * instantiated (or it has been instantiated and has since been garbage collected, hence it
 * no longer exists.)
 *
 * When discussing lifespan of Qwik component, it is necessary to expand the definition into
 * three states: `Void`, `dehydrated`, and `Hydrated`.
 * 1. `Void`: Component does not exist. Nothing has been created yet. This is equivalent to
 *   object not being instantiated or object not existing.
 * 2. `Hydrated`: Component exists in VM heap and can be passed around as a reference. This
 *   is equivalent to how developers normally think of objects.
 * 2. `Dehydrated`: An in-between state between `Void` and `Hydrated`. A component has been
 *   created but it is net represented in VM heap as an actual object which can be passed
 *   around as a reference. In this state the component's state is serialized in the DOM/HTML
 *   but does not have VM heap representation.
 *
 * A Typical lifecycle of a component in an SSR scenario.
 * 1. Component is created on server. It is in the `Hydrated` state and can be passed around
 *   by reference (normal way of passing objects in JS.)
 * 2. Server completes rendering and `dehydrate`s all of the components. This serializes all
 *   of the component state into the DOM attributes. Once the state is serialized in the DOM
 *   the server can convert the DOM into HTML and send the HTML to the client.
 * 3. At this point the VM no longer has a reference to the component instances. However, It
 *   would be incorrect to say that the component no longer exists. Instead the component
 *   is in `dehydrated` state. It is somewhere between non-existing and fully existing.
 * 4. Client receives the HTML and turns it back to DOM. The DOM contains the component's
 *   state, but the component is not yet hydrated.
 * 5. Some action is performed which requires that the component is fully hydrated. It is
 *   at this point that the component can be re-created. Obviously, from the reference point
 *   the object on server and on the client are different instances. But logically we can say
 *   that it is the same component.
 *
 * For the above reasons, it is important to differentiate between logical component, and a
 * component instance. Logical component being a component which can span creation on server
 * and execution on the client. A logical component survives dehydration/re-hydration events
 * (component instance do not.)
 *
 *
 * To describe the whole lifecycle of component refer to the diagram and explanation below.
 * ```
 *  logical  ||          ||  private || transient  ||        component ||
 * component ||   DOM    ||   state  ||   state    ||         instance ||
 *    JSX    ||          ||   STATE  || TRANSIENT  ||         (VM ref) ||
 * ======================================================================
 *   (1)
 * <MyComp>      (2)
 *    ||      <my-comp/>                                       (3)   new
 *    ||          ||                                         QComponent()
 *    ||          ||            new               (4)                |
 *    ||          ||          STATE() <---------[OnMount]----------- |
 *    ||          ||             ||                                  |
 *    ||          ||             || - - - - - - - (5) - - - - - - -> ||
 *    ||          ||             ||      new             (6)         ||
 *    ||          ||             ||   TRANSIENT() <---[OnHydrate]--- ||
 *    ||          ||             ||       ||                         ||
 *    ||          ||             ||       || - - - - - -(7)- - - - > |||
 *    ||          ||             ||       ||                         |||
 *    ||          ||             ||       ||        (8)              |||
 *    ||       <my-comp> <=======================[OnRender]========= |||
 *    ||    (9)  <view/>         ||       ||                         |||
 *    ||       </my-comp>        ||       ||                         |||
 *    ||          ||             ||       ||                         |||
 *    ||          ||             ||  (10) ||                         |||
 * ---------------------------- dehydrate(document) -----------------------+
 *    ||          ||             ||       ||                         |||   |
 *    ||          ||             ||       ||           (11)          |||   |
 *    ||          ||   (12)      ||       XX <-----[OnDehydrate]---- XXX <-+
 *    ||   <my-comp {STATE}> <-- XX                                    (13)|
 *    ||   ===================  Serialized to HTML ===================== <-+
 *    ||   ==          (14)             HTTP                          ==
 *    ||   ===================  Deserialize from HTML  =================
 *    ||   <my-comp {STATE}>
 *    ||     <view/>   (15)
 *    ||   </my-comp>
 *    ||          ||             (16)                           (17)   new
 *    ||          ||             JSON                           QComponent()
 *    ||          || - - - - -> (parse) - - - - - - - - - - - - - - >||
 *    ||          ||             ||                                  ||
 *    ||          ||             ||      new            (18)         ||
 *    ||          ||             ||   TRANSIENT() <---[OnHydrate]--- ||
 *    ||          ||             ||       ||                         ||
 *    ||          ||             ||       || - - - - - (19) - - - -> |||
 *    ||          ||             ||       ||                         |||
 *    ||          ||             ||       ||                         |||
 *    ||          ||             ||       ||        (20)             |||
 *    ||       <my-comp> <=======================[OnRender]========= |||
 *    ||   (21)  <view/>         ||       ||                         |||
 *    ||       </my-comp>        ||       ||                         |||
 *    ||          ||             ||       ||                         |||
 * (removed)      ||             ||       ||            (24)         |||
 *   (22)  +-->(removed) ---------------------------[OnUnmount]----> |||
 *               (23)            ||       ||            (25)         |||
 *                               XX<------XX <-----[OnDehydrate]---- XXX
 * ```
 * Please match the numbers in the diagram above the the explanation below.
 * 1. A logic component is created, when parent component's render function
 *   creates a `<MyComp>` node.
 * 2. The result of executing the parent's component JSX is that '<my-comp>` host-element
 *   is created in the DOM, and the `<MyComp>`'s view is scheduled for rendering.
 * 3. Before rendering can start the component instance needs to be created. This is
 *   equivalent to `new QComponent()`. The newly created `QComponent` is missing the
 *   private and transient state and so it fires `[OnMount]` (and a bit later `[OnHydrate]`)
 * 4. `[OnMount]`: Allows the `[OnMount]` hook to create the state of the component.
 * 5. The new `STATE` is assigned into `QComponent`. This allows the `[OnHydrate]` hook to run.
 * 6. `[OnHydrate]`: Responsible for creating `TRANSIENT` state. Transient state is state which
 *   can't be serialized (ie. promises, observables, closures, streams.) It is separated from
 *   `[OnMount]` because `[OnMount]` runs only once for logical component. Application needs a
 *   way to be notified every time the component is deserialized.
 * 7. The new `TRANSIENT` state is assigned to `QComponent`. At this point the component is
 *   fully re-hydrated and can be used for rendering or event handling.
 * 8. `[OnRender]`: This invokes the `MyComp`s render function which produces JSX nodes to be
 *   reconciled against the DOM.
 * 9. The result of `[OnRender]` and reconciliation is that the `<my-comp>` host-element now
 *   contains `MyComp`s view fully rendered..
 * 10. `dehydrate()`: At some point the server determines that the SSR is finished and the
 *   rendered applications should be sent to the client. The first step is to serialize
 *   all of the data into the DOM. This method locates all of the
 *   component's and triggers the `[OnDehydrate]` hook.
 * 11. `[OnDehydrate]` is responsible for doing the reverse of `[OnHydrate]`. The method is
 *   responsible for releasing any resources which the `[OnHydrate]` acquired and which are
 *   stored in `TRANSIENT` state.
 * 12. Qwik serializes the `STATE` of the component into the DOM. At this point the
 *   `QComponent` is released and is available for garbage-collection.
 * 13. After `dehydrate()` completes the DOM can be serialized to HTML and sent to the client.
 * 14. The client receives the HTML and deserializes it into DOM.
 * 15. The deserialized DOM contains the `<my-comp {STATE}>` element along with its serialized
 *   state. The components are deserialized lazily. Only when `QComponent` instance is needed
 *   does it go through the deserialization process.
 * 16. If component is needed it can go through re-hydration process. First the component's
 *   state is parsed from the DOM and passed to the `QComponent`
 * 17. A new `QComponent` is created and the deserialized state is assigned to it.
 * 18. `[OnHydrate]`: `[OnHydrate]` hook runs which creates a transient state for the component.
 *   This is also a good place to recreate any non-serializable objects, such as promises, observables,
 *   closures and streams.
 * 19. The new `TRANSIENT` state is assigned to the `QComponent`. At this point the `QComponent`
 *   is ready to be used in rendering.
 * 20. `[OnRender]`: On render method can execute which can create a new JSX nodes.
 * 21. The rendered DOM is updated to reflect the changes from `<MyComp>`. The update process
 *   does not force child or parent components to be re-rendered unless the update changes
 *   props of those components.
 * 22. At some point the parent component removes the `<MyComp>` from ins JSX tree. This triggers
 *   the destroy process.
 * 23. The DOM is updated and `<my-comp>` is removed.
 * 24. `[OnUnmount]`: lifecycle hook is invoked to let the component know that it is being removed.
 * 25. `[OnDehydrate]`: lifecycle hook is invoked to clean up the transient state of the component.
 *
 */

/**
 * Infers `Props` from `QComponent`.
 *
 * Given:
 * ```
 * interface MyProps {}
 * interface MyState {}
 * interface MyTransient {}
 * type MyComponent = QComponent<MyProps, MyState, MyTransient>;
 * ```
 *
 * Then:
 * ```
 * const myProps: PropsOf<MyComponent> = ...;         // Same as `MyProps`
 * const myState: StateOf<MyComponent> = ...;         // Same as `MyState`
 * const myTransient: TransientOf<MyComponent> = ...; // Same as `MyTransient`
 * ```
 *
 * @public
 */
export type PropsOf<ENTITY extends QComponent> = ENTITY extends QComponent<infer PROPS>
  ? PROPS
  : never;

/**
 * Infers `State` from `QComponent`.
 *
 * Given:
 * ```
 * interface MyProps {}
 * interface MyState {}
 * interface MyTransient {}
 * type MyComponent = QComponent<MyProps, MyState, MyTransient>;
 * ```
 *
 * Then:
 * ```
 * const myProps: PropsOf<MyComponent> = ...;         // Same as `MyProps`
 * const myState: StateOf<MyComponent> = ...;         // Same as `MyState`
 * const myTransient: TransientOf<MyComponent> = ...; // Same as `MyTransient`
 * ```
 *
 * @public
 */
export type StateOf<ENTITY extends QComponent> = ENTITY extends QComponent<any, infer STATE>
  ? STATE
  : never;

//
