import { $, type PropFnInterface, type QRL } from '../qrl/qrl.public';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { OnRenderProp, QSlot } from '../util/markers';
import type {
  ComponentBaseProps,
  EventHandler,
  JSXChildren,
  QRLEventHandlerMulti,
} from '../render/jsx/types/jsx-qwik-attributes';
import type { FunctionComponent } from '../render/jsx/types/jsx-node';
import { Virtual, _jsxC } from '../render/jsx/jsx-runtime';
import { SERIALIZABLE_STATE } from '../container/serializers';
import { qTest } from '../util/qdev';
import { assertQrl } from '../qrl/qrl-class';
import type { ValueOrPromise } from '../util/types';
import { _IMMUTABLE } from '../state/constants';
import { assertNumber } from '../error/assert';
import type { QwikIntrinsicElements } from '../render/jsx/types/jsx-qwik-elements';

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
export type PropsOf<COMP> = COMP extends Component<infer PROPS>
  ? NonNullable<PROPS>
  : COMP extends FunctionComponent<infer PROPS>
    ? NonNullable<PublicProps<PROPS>>
    : COMP extends string
      ? QwikIntrinsicElements[COMP]
      : Record<string, unknown>;

/**
 * Type representing the Qwik component.
 *
 * `Component` is the type returned by invoking `component$`.
 *
 * ```tsx
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
export type Component<PROPS extends Record<any, any> = Record<string, unknown>> = FunctionComponent<
  PublicProps<PROPS>
>;

export type ComponentChildren<PROPS extends Record<any, any>> = PROPS extends {
  children: any;
}
  ? never
  : { children?: JSXChildren };
/**
 * Extends the defined component PROPS, adding the default ones (children and q:slot)..
 *
 * @public
 */
export type PublicProps<PROPS extends Record<any, any>> = TransformProps<PROPS> &
  ComponentBaseProps &
  ComponentChildren<PROPS>;

/**
 * Transform the component PROPS.
 *
 * @public
 */
export type TransformProps<PROPS extends Record<any, any>> = {
  [K in keyof PROPS]: TransformProp<PROPS[K], K>;
};

/** @public */
export type TransformProp<T, K> = NonNullable<T> extends (...args: infer ARGS) => infer RET
  ? (...args: ARGS) => ValueOrPromise<Awaited<RET>>
  : T extends QRLEventHandlerMulti<infer EV, infer EL>
    ? EventHandler<EV, EL> | T
    : K extends `${string}$`
      ? T extends QRL<infer U>
        ? T | U
        : T
      : T;

// const ELEMENTS_SKIP_KEY: JSXTagName[] = ['html', 'body', 'head'];

// <docs markdown="../readme.md#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#component instead)
/**
 * Declare a Qwik component that can be used to create UI.
 *
 * Use `component$` to declare a Qwik component. A Qwik component is a special kind of component
 * that allows the Qwik framework to lazy load and execute the component independently of other Qwik
 * components as well as lazy load the component's life-cycle hooks and event handlers.
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
export const componentQrl = <PROPS extends Record<any, any>>(
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

export const isQwikComponent = <T extends Component<any>>(component: unknown): component is T => {
  return typeof component == 'function' && (component as any)[SERIALIZABLE_STATE] !== undefined;
};

/** @public */
export type PropFunctionProps<PROPS extends Record<any, any>> = {
  [K in keyof PROPS]: PROPS[K] extends undefined
    ? PROPS[K]
    : PROPS[K] extends ((...args: infer ARGS) => infer RET) | undefined
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
 * that allows the Qwik framework to lazy load and execute the component independently of other Qwik
 * components as well as lazy load the component's life-cycle hooks and event handlers.
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
export const component$ = <PROPS extends Record<any, any>>(
  onMount: (props: PROPS) => JSXNode | null
): Component<PropFunctionProps<PROPS>> => {
  return componentQrl<any>($(onMount));
};

/** @public */
export type OnRenderFn<PROPS extends Record<any, any>> = (props: PROPS) => JSXNode | null;

export interface RenderFactoryOutput<PROPS extends Record<any, any>> {
  renderQRL: QRL<OnRenderFn<PROPS>>;
  waitOn: any[];
}
