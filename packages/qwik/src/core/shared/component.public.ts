import { dollar, type QRL } from './qrl/qrl.public';
import type { JSXNodeInternal, JSXOutput } from './jsx/types/jsx-node';
import type {
  ComponentBaseProps,
  EventHandler,
  JSXChildren,
  QRLEventHandlerMulti,
} from './jsx/types/jsx-qwik-attributes';
import type { FunctionComponent } from './jsx/types/jsx-node';
import { _jsxSplit } from '../internal';
import type { QwikIntrinsicElements } from './jsx/types/jsx-qwik-elements';
import { assertNumber } from './error/assert';
import { qTest } from './utils/qdev';
import { assertQrl } from './qrl/qrl-utils';
import { isDev } from '@qwik.dev/core/build';
import type { QRLInternal } from './qrl/qrl-class';

// TS way to check for any
type IsAny<T> = 0 extends T & 1 ? true : false;

type ObjectProps<T> =
  IsAny<T> extends true
    ? any
    : // unknown means we don't accept any props
      unknown extends T
      ? never
      : T extends Record<any, any>
        ? T
        : never;

/**
 * Infers `Props` from the component or tag.
 *
 * @example
 *
 * ```tsx
 * const Desc = component$(({desc, ...props}: { desc: string } & PropsOf<'div'>) => {
 *  return <div {...props}>{desc}</div>;
 * });
 *
 * const TitleBox = component$(({title, ...props}: { title: string } & PropsOf<Box>) => {
 *   return <Box {...props}><h1>{title}</h1></Box>;
 * });
 * ```
 *
 * @public
 */
// </docs>
export type PropsOf<COMP> = COMP extends string
  ? COMP extends keyof QwikIntrinsicElements
    ? QwikIntrinsicElements[COMP]
    : // `<span/>` has no special attributes
      QwikIntrinsicElements['span']
  : NonNullable<COMP> extends never
    ? never
    : COMP extends FunctionComponent<infer PROPS>
      ? PROPS extends Record<any, infer V>
        ? IsAny<V> extends true
          ? // we couldn't figure it out
            never
          : ObjectProps<PROPS>
        : COMP extends Component<infer OrigProps>
          ? ObjectProps<OrigProps>
          : // something complex, just return as-is
            PROPS
      : never;

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
// In reality, Component is a QRL but that makes the types too complex
export type Component<PROPS = unknown> = FunctionComponent<PublicProps<PROPS>>;

export type ComponentChildren<PROPS> = PROPS extends {
  children: any;
}
  ? never
  : { children?: JSXChildren };
/**
 * Extends the defined component PROPS, adding the default ones (children and q:slot) and allowing
 * plain functions to QRL arguments.
 *
 * @public
 */
export type PublicProps<PROPS> =
  // Use Omit + _Only$ so that inferring polymorpic components works
  // Mapping the entire PROPS doesn't work, maybe TS doesn't like inferring through conditional types
  (PROPS extends Record<any, any>
    ? Omit<PROPS, `${string}$`> & _Only$<PROPS>
    : unknown extends PROPS
      ? {}
      : PROPS) &
    ComponentBaseProps &
    ComponentChildren<PROPS>;

type _AllowPlainQrl<Q> =
  // QRLEventHandlerMulti gets a special case to simplify the result
  // It needs to be handled carefully because it matches regular functions too
  QRLEventHandlerMulti<any, any> extends Q
    ? Q extends QRLEventHandlerMulti<infer EV, infer EL>
      ?
          | Q
          // It can infer unknown and that breaks things
          | (EL extends Element ? EventHandler<EV, EL> : never)
      : Q
    : Q extends QRL<infer U>
      ? Q | U
      : NonNullable<Q> extends never
        ? Q
        : QRL<Q> | Q;

type _Only$<P> = {
  [K in keyof P as K extends `${string}$` ? K : never]: _AllowPlainQrl<P[K]>;
};

/** @internal */
export const componentQrl = <PROPS extends Record<any, any>>(
  componentQrl: QRL<OnRenderFn<PROPS>>
): Component<PROPS> => {
  // Return a QComponent Factory function.
  function QwikComponent(
    props: PublicProps<PROPS>,
    key: string | null,
    flags: number = 0
  ): JSXNodeInternal {
    isDev && assertQrl(componentQrl);
    isDev && assertNumber(flags, 'The Qwik Component was not invoked correctly');
    const hash = qTest ? 'sX' : (componentQrl as QRLInternal).$hash$.slice(0, 4);
    const finalKey = hash + ':' + (key ? key : '');
    const InnerCmp = () => {};
    (InnerCmp as any)[SERIALIZABLE_STATE] = [componentQrl];
    return _jsxSplit(InnerCmp as any, props, null, props.children, flags, finalKey);
  }
  (QwikComponent as any)[SERIALIZABLE_STATE] = [componentQrl];
  return QwikComponent as any;
};

export const SERIALIZABLE_STATE = Symbol('serializable-data');

export const isQwikComponent = <T extends Component<any>>(component: unknown): component is T => {
  return typeof component == 'function' && (component as any)[SERIALIZABLE_STATE] !== undefined;
};

// <docs markdown="../readme.md#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#component instead and run `pnpm docs.sync`)
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
export const component$ = <PROPS = unknown>(onMount: OnRenderFn<PROPS>): Component<PROPS> => {
  return componentQrl(dollar(onMount));
};

/** @public */
export type OnRenderFn<PROPS> = (props: PROPS) => JSXOutput;
