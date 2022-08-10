import { $, QRL } from '../import/qrl.public';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { OnRenderProp } from '../util/markers';
import type { ComponentBaseProps } from '../render/jsx/types/jsx-qwik-attributes';
import type { FunctionComponent } from '../render/jsx/types/jsx-node';
import { jsx } from '../render/jsx/jsx-runtime';
import type { MutableWrapper } from '../object/q-object';
import { SERIALIZABLE_STATE } from '../object/serializers';
import { qTest } from '../util/qdev';
import { Virtual } from '../render/jsx/host.public';

/**
 * Infers `Props` from the component.
 *
 * ```typescript
 * export const OtherComponent = component$(() => {
 *   return $(() => <Counter value={100} />);
 * });
 * ```
 *
 * @public
 */
// </docs>
export type PropsOf<COMP extends Component<any>> = COMP extends Component<infer PROPS>
  ? NonNullable<PROPS>
  : never;

/**
 * Type representing the Qwik component.
 *
 * `Component` is the type returned by invoking `component$`.
 *
 * ```
 * interface MyComponentProps {
 *   someProp: string;
 * }
 * const MyComponent: Component<MyComponentProps> = component$((props: MyComponentProps) => {
 *   return <span>{props.someProp}</span>;
 * });
 * ```
 *
 * @public
 */
export type Component<PROPS extends {}> = FunctionComponent<PublicProps<PROPS>>;

/**
 * @public
 */
export type PublicProps<PROPS extends {}> = MutableProps<PROPS> & ComponentBaseProps;

/**
 * @public
 */
export type MutableProps<PROPS extends {}> = {
  [K in keyof PROPS]: PROPS[K] | MutableWrapper<PROPS[K]>;
};

/**
 * @alpha
 */
export type EventHandler<T> = QRL<(value: T) => any>;

// const ELEMENTS_SKIP_KEY: JSXTagName[] = ['html', 'body', 'head'];

// <docs markdown="../readme.md#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#component instead)
/**
 * Declare a Qwik component that can be used to create UI.
 *
 * Use `component$` to declare a Qwik component. A Qwik component is a special kind of component
 * that allows the Qwik framework to lazy load and execute the component independently of other
 * Qwik components as well as lazy load the component's life-cycle hooks and event handlers.
 *
 * Side note: You can also declare regular (standard JSX) components that will have standard
 * synchronous behavior.
 *
 * Qwik component is a facade that describes how the component should be used without forcing the
 * implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:
 *
 * ### Example:
 *
 * An example showing how to create a counter component:
 *
 * ```tsx
 * export interface CounterProps {
 *   initialValue?: number;
 *   step?: number;
 * }
 * export const Counter = component$((props: CounterProps) => {
 *   const state = useStore({ count: props.initialValue || 0 });
 *   return (
 *     <div>
 *       <span>{state.count}</span>
 *       <button onClick$={() => (state.count += props.step || 1)}>+</button>
 *     </div>
 *   );
 * });
 * ```
 *
 * - `component$` is how a component gets declared.
 * - `{ value?: number; step?: number }` declares the public (props) interface of the component.
 * - `{ count: number }` declares the private (state) interface of the component.
 *
 * The above can then be used like so:
 *
 * ```tsx
 * export const OtherComponent = component$(() => {
 *   return <Counter initialValue={100} />;
 * });
 * ```
 *
 * See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`,
 * `useOnWindow`, `useStyles`
 *
 * @public
 */
// </docs>
export const componentQrl = <PROPS extends {}>(
  onRenderQrl: QRL<OnRenderFn<PROPS>>
): Component<PROPS> => {
  // Return a QComponent Factory function.
  function QwikComponent(props: PublicProps<PROPS>, key?: string): JSXNode<PROPS> {
    const hash = qTest ? 'sX' : onRenderQrl.getHash();
    const finalKey = hash + ':' + (key ? key : '');
    return jsx(Virtual, { [OnRenderProp]: onRenderQrl, ...props }, finalKey) as any;
  }
  (QwikComponent as any)[SERIALIZABLE_STATE] = [onRenderQrl];
  return QwikComponent;
};

export const isQwikComponent = (component: any): component is Component<any> => {
  return typeof component == 'function' && component[SERIALIZABLE_STATE] !== undefined;
};

// <docs markdown="../readme.md#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#component instead)
/**
 * Declare a Qwik component that can be used to create UI.
 *
 * Use `component$` to declare a Qwik component. A Qwik component is a special kind of component
 * that allows the Qwik framework to lazy load and execute the component independently of other
 * Qwik components as well as lazy load the component's life-cycle hooks and event handlers.
 *
 * Side note: You can also declare regular (standard JSX) components that will have standard
 * synchronous behavior.
 *
 * Qwik component is a facade that describes how the component should be used without forcing the
 * implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:
 *
 * ### Example:
 *
 * An example showing how to create a counter component:
 *
 * ```tsx
 * export interface CounterProps {
 *   initialValue?: number;
 *   step?: number;
 * }
 * export const Counter = component$((props: CounterProps) => {
 *   const state = useStore({ count: props.initialValue || 0 });
 *   return (
 *     <div>
 *       <span>{state.count}</span>
 *       <button onClick$={() => (state.count += props.step || 1)}>+</button>
 *     </div>
 *   );
 * });
 * ```
 *
 * - `component$` is how a component gets declared.
 * - `{ value?: number; step?: number }` declares the public (props) interface of the component.
 * - `{ count: number }` declares the private (state) interface of the component.
 *
 * The above can then be used like so:
 *
 * ```tsx
 * export const OtherComponent = component$(() => {
 *   return <Counter initialValue={100} />;
 * });
 * ```
 *
 * See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`,
 * `useOnWindow`, `useStyles`
 *
 * @public
 */
// </docs>
export const component$ = <PROPS extends {}>(onMount: OnRenderFn<PROPS>): Component<PROPS> => {
  return componentQrl<PROPS>($(onMount));
};

/**
 * @public
 */
export type OnRenderFn<PROPS> = (props: PROPS) => JSXNode<any> | null | (() => JSXNode<any>);

export interface RenderFactoryOutput<PROPS> {
  renderQRL: QRL<OnRenderFn<PROPS>>;
  waitOn: any[];
}
