import { $, type PropFnInterface, type QRL } from '../qrl/qrl.public';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { OnRenderProp, QSlot } from '../util/markers';
import type { ComponentBaseProps, JSXChildren } from '../render/jsx/types/jsx-qwik-attributes';
import type { FunctionComponent } from '../render/jsx/types/jsx-node';
import { Virtual, _jsxC } from '../render/jsx/jsx-runtime';
import { SERIALIZABLE_STATE } from '../container/serializers';
import { qTest } from '../util/qdev';
import { assertQrl } from '../qrl/qrl-class';
import type { ValueOrPromise } from '../util/types';
import { _IMMUTABLE } from '../state/constants';
import { assertNumber } from '../error/assert';

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

export type ComponentChildren<PROPS extends {}> = PROPS extends { children: any }
  ? never
  : { children?: JSXChildren };
/**
 * Extends the defined component PROPS, adding the default ones (children and q:slot)..
 * @public
 */
export type PublicProps<PROPS extends {}> = TransformProps<PROPS> &
  ComponentBaseProps &
  ComponentChildren<PROPS>;

/**
 * Transform the component PROPS.
 * @public
 */
export type TransformProps<PROPS extends {}> = {
  [K in keyof PROPS]: TransformProp<PROPS[K]>;
};

/**
 * @public
 */
export type TransformProp<T> = NonNullable<T> extends (...args: infer ARGS) => infer RET
  ? (...args: ARGS) => ValueOrPromise<Awaited<RET>>
  : T;

/**
 * @public
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
 * ### Example
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
  componentQrl: QRL<OnRenderFn<PROPS>>
): Component<PROPS> => {
  // Return a QComponent Factory function.
  function QwikComponent(props: PublicProps<PROPS>, key: string | null, flags: number): JSXNode {
    assertQrl(componentQrl);
    assertNumber(flags, 'The Qwik Component was not invoked correctly');
    const hash = qTest ? 'sX' : componentQrl.$hash$.slice(0, 4);
    const finalKey = hash + ':' + (key ? key : '');
    return _jsxC(
      Virtual,
      {
        [OnRenderProp]: componentQrl,
        [QSlot]: props[QSlot],
        [_IMMUTABLE]: (props as any)[_IMMUTABLE],
        children: props.children,
        props,
      },
      flags,
      finalKey
    ) as any;
  }
  (QwikComponent as any)[SERIALIZABLE_STATE] = [componentQrl];
  return QwikComponent as any;
};

export const isQwikComponent = (component: any): component is Component<any> => {
  return typeof component == 'function' && component[SERIALIZABLE_STATE] !== undefined;
};

/**
 * @public
 */
export type PropFunctionProps<PROPS extends {}> = {
  [K in keyof PROPS]: NonNullable<PROPS[K]> extends (...args: infer ARGS) => infer RET
    ? PropFnInterface<ARGS, Awaited<RET>>
    : PROPS[K];
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
 * ### Example
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
export const component$ = <
  PROPS = unknown,
  ARG extends {} = PROPS extends {} ? PropFunctionProps<PROPS> : {},
>(
  onMount: OnRenderFn<ARG>
): Component<PROPS extends {} ? PROPS : ARG> => {
  return componentQrl<any>($(onMount));
};

/**
 * @public
 */
export type OnRenderFn<PROPS extends {}> = (props: PROPS) => JSXNode<any> | null;

export interface RenderFactoryOutput<PROPS extends {}> {
  renderQRL: QRL<OnRenderFn<PROPS>>;
  waitOn: any[];
}
