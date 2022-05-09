import { toQrlOrError } from '../import/qrl';
import { $, implicit$FirstArg, QRL } from '../import/qrl.public';
import { qPropWriteQRL } from '../props/props-on';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { StyleAppend, useWaitOn } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';
import { ComponentScopedStyles, OnRenderProp } from '../util/markers';
import { styleKey } from './qrl-styles';
import type { ComponentBaseProps } from '../render/jsx/types/jsx-qwik-attributes';
import type { ValueOrPromise } from '../util/types';
import { getContext } from '../props/props';
import type { FunctionComponent } from '../render/jsx/types/jsx-node';
import { jsx } from '../render/jsx/jsx-runtime';
import { useSequentialScope } from '../use/use-store.public';
import { WatchDescriptor, WatchFlags } from '../watch/watch.public';

// <docs markdown="./component.public.md#useCleanup">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useCleanup instead)
/**
 * A lazy-loadable reference to a component's destroy hook.
 *
 * Invoked when the component is destroyed (removed from render tree).
 *
 * @public
 */
// </docs>
export function useCleanupQrl(unmountFn: QRL<() => void>): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const el = useHostElement();
    const watch: WatchDescriptor = {
      qrl: unmountFn,
      el,
      f: WatchFlags.IsCleanup,
    };
    setWatch(watch);
    getContext(el).refMap.add(watch);
  }
}

// <docs markdown="./component.public.md#useCleanup">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useCleanup instead)
/**
 * A lazy-loadable reference to a component's destroy hook.
 *
 * Invoked when the component is destroyed (removed from render tree).
 *
 * @public
 */
// </docs>
export const useCleanup$ = implicit$FirstArg(useCleanupQrl);

// <docs markdown="./component.public.md#useResume">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useResume instead)
/**
 * A lazy-loadable reference to a component's on resume hook.
 *
 * The hook is eagerly invoked when the application resumes on the client. Because it is called
 * eagerly, this allows the component to resume even if no user interaction has taken place.
 *
 * @public
 */
// </docs>
export function useResumeQrl(resumeFn: QRL<() => void>): void {
  useOn('qresume', resumeFn);
}

// <docs markdown="./component.public.md#useResume">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useResume instead)
/**
 * A lazy-loadable reference to a component's on resume hook.
 *
 * The hook is eagerly invoked when the application resumes on the client. Because it is called
 * eagerly, this allows the component to resume even if no user interaction has taken place.
 *
 * @public
 */
// </docs>
export const useResume$ = implicit$FirstArg(useResumeQrl);

// <docs markdown="./component.public.md#useVisible">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useVisible instead)
/**
 * A lazy-loadable reference to a component's on visible hook.
 *
 * The hook is lazily invoked when the component becomes visible.
 *
 * @public
 */
// </docs>
export function useVisibleQrl(resumeFn: QRL<() => void>): void {
  useOn('qvisible', resumeFn);
}

// <docs markdown="./component.public.md#useVisible">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useVisible instead)
/**
 * A lazy-loadable reference to a component's on visible hook.
 *
 * The hook is lazily invoked when the component becomes visible.
 *
 * @public
 */
// </docs>
export const useVisible$ = implicit$FirstArg(useVisibleQrl);

// <docs markdown="./component.public.md#usePause">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#usePause instead)
/**
 * A lazy-loadable reference to a component's on pause hook.
 *
 * Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows
 * the component to do last-minute clean-up before its state is serialized.
 *
 * Typically used with transient state.
 *
 * @public
 */
// </docs>
export function usePauseQrl(dehydrateFn: QRL<() => void>): void {
  throw new Error('IMPLEMENT: onPause' + dehydrateFn);
}

// <docs markdown="./component.public.md#usePause">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#usePause instead)
/**
 * A lazy-loadable reference to a component's on pause hook.
 *
 * Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows
 * the component to do last-minute clean-up before its state is serialized.
 *
 * Typically used with transient state.
 *
 * @public
 */
// </docs>
export const usePause$ = implicit$FirstArg(usePauseQrl);

// <docs markdown="./component.public.md#useOn">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useOn instead)
/**
 * Register a listener on the current component's host element.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX.
 *
 * See: `on`, `onWindow`, `onDocument`.
 *
 * @public
 */
// </docs>
export function useOn(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on:${event}`, eventFn);
}

// <docs markdown="./component.public.md#useOnDocument">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useOnDocument instead)
/**
 * Register a listener on `document`.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX.
 *
 * See: `on`, `onWindow`, `onDocument`.
 *
 * @public
 */
// </docs>
export function useOnDocument(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on-document:${event}`, eventFn);
}

// <docs markdown="./component.public.md#useOnWindow">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useOnWindow instead)
/**
 * Register a listener on `window`.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX.
 *
 * See: `on`, `onWindow`, `onDocument`.
 *
 * @public
 */
// </docs>
export function useOnWindow(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on-window:${event}`, eventFn);
}

// <docs markdown="./component.public.md#useStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useStyles instead)
/**
 * Refer to component styles.
 *
 * @alpha
 */
// </docs>
export function useStylesQrl(styles: QRL<string>): void {
  _useStyles(styles, false);
}

// <docs markdown="./component.public.md#useStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useStyles instead)
/**
 * Refer to component styles.
 *
 * @alpha
 */
// </docs>
export const useStyles$ = implicit$FirstArg(useStylesQrl);

// <docs markdown="./component.public.md#useScopedStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useScopedStyles instead)
/**
 * @alpha
 */
// </docs>
export function useScopedStylesQrl(styles: QRL<string>): void {
  _useStyles(styles, true);
}

// <docs markdown="./component.public.md#useScopedStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#useScopedStyles instead)
/**
 * @alpha
 */
// </docs>
export const useScopedStyles$ = implicit$FirstArg(useScopedStylesQrl);

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
export type PropsOf<COMP extends (props: any) => JSXNode<any> | null> = COMP extends (
  props: infer PROPS
) => JSXNode<any> | null
  ? NonNullable<PROPS>
  : never;

/**
 * @public
 */
export interface ComponentOptions {
  tagName?: string;
}

/**
 * @public
 */
export type Component<PROPS extends {}> = FunctionComponent<PublicProps<PROPS>>;

export type PublicProps<PROPS extends {}> = PROPS & On$Props<PROPS> & ComponentBaseProps;

export type On$Props<T extends {}> = {
  [K in keyof T as K extends `${infer A}Qrl`
    ? NonNullable<T[K]> extends QRL
      ? `${A}$`
      : never
    : never]?: NonNullable<T[K]> extends QRL<infer B> ? B : never;
};

export type EventHandler<T> = QRL<(value: T) => any>;

// <docs markdown="./component.public.md#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#component instead)
/**
 * Declare a Qwik component that can be used to create UI.
 *
 * Use `component` (and `component$`) to declare a Qwik component. A Qwik component is a special
 * kind of component that allows the Qwik framework to lazy load and execute the component
 * independently of other Qwik components as well as lazy load the component's life-cycle hooks
 * and event handlers.
 *
 * Side note: You can also declare regular (standard JSX) components that will have standard
 * synchronous behavior.
 *
 * Qwik component is a facade that describes how the component should be used without forcing the
 * implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:
 *
 * - Component `onMount` method, which needs to return an
 * - `onRender` closure which constructs the component's JSX.
 *
 * ### Example:
 *
 * An example showing how to create a counter component:
 *
 * ```typescript
 * export const Counter = component$((props: { value?: number; step?: number }) => {
 *   const state = useStore({ count: props.value || 0 });
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
 * - `onMount` closure: is used to create the data store (see: `useStore`);
 * - `$`: mark which parts of the component will be lazy-loaded. (see `$` for details.)
 *
 * The above can then be used like so:
 *
 * ```typescript
 * export const OtherComponent = component$(() => {
 *   return <Counter value={100} />;
 * });
 * ```
 *
 * See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`,
 * `useOnWindow`, `useStyles`, `useScopedStyles`
 *
 * @param onMount - Initialization closure used when the component is first created.
 * @param tagName - Optional components options. It can be used to set a custom tag-name to be
 * used for the component's host element.
 *
 * @public
 */
// </docs>
export function componentQrl<PROPS extends {}>(
  onRenderQrl: QRL<OnRenderFn<PROPS>>,
  options: ComponentOptions = {}
): Component<PROPS> {
  const tagName = options.tagName ?? 'div';

  // Return a QComponent Factory function.
  return function QSimpleComponent(props, key): JSXNode<PROPS> {
    return jsx(tagName, { [OnRenderProp]: onRenderQrl, ...props }, key) as any;
  };
}

// <docs markdown="./component.public.md#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./component.public.md#component instead)
/**
 * Declare a Qwik component that can be used to create UI.
 *
 * Use `component` (and `component$`) to declare a Qwik component. A Qwik component is a special
 * kind of component that allows the Qwik framework to lazy load and execute the component
 * independently of other Qwik components as well as lazy load the component's life-cycle hooks
 * and event handlers.
 *
 * Side note: You can also declare regular (standard JSX) components that will have standard
 * synchronous behavior.
 *
 * Qwik component is a facade that describes how the component should be used without forcing the
 * implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:
 *
 * - Component `onMount` method, which needs to return an
 * - `onRender` closure which constructs the component's JSX.
 *
 * ### Example:
 *
 * An example showing how to create a counter component:
 *
 * ```typescript
 * export const Counter = component$((props: { value?: number; step?: number }) => {
 *   const state = useStore({ count: props.value || 0 });
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
 * - `onMount` closure: is used to create the data store (see: `useStore`);
 * - `$`: mark which parts of the component will be lazy-loaded. (see `$` for details.)
 *
 * The above can then be used like so:
 *
 * ```typescript
 * export const OtherComponent = component$(() => {
 *   return <Counter value={100} />;
 * });
 * ```
 *
 * See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`,
 * `useOnWindow`, `useStyles`, `useScopedStyles`
 *
 * @param onMount - Initialization closure used when the component is first created.
 * @param tagName - Optional components options. It can be used to set a custom tag-name to be
 * used for the component's host element.
 *
 * @public
 */
// </docs>
export function component$<PROPS extends {}>(
  onMount: OnRenderFn<PROPS>,
  options?: ComponentOptions
): Component<PROPS> {
  return componentQrl<PROPS>($(onMount), options);
}

/**
 * @public
 */
export type OnRenderFn<PROPS> = (props: PROPS) => ValueOrPromise<JSXNode<any> | null>;

export interface RenderFactoryOutput<PROPS> {
  renderQRL: QRL<OnRenderFn<PROPS>>;
  waitOn: any[];
}

function _useStyles(styles: QRL<string>, scoped: boolean) {
  const [style, setStyle] = useSequentialScope();
  if (style === true) {
    return;
  }
  setStyle(true);
  const styleQrl = toQrlOrError(styles);
  const styleId = styleKey(styleQrl);
  const hostElement = useHostElement();
  if (scoped) {
    hostElement.setAttribute(ComponentScopedStyles, styleId);
  }

  useWaitOn(
    styleQrl.resolve(hostElement).then((styleText) => {
      const task: StyleAppend = {
        type: 'style',
        styleId,
        content: scoped ? styleText.replace(/�/g, styleId) : styleText,
      };
      return task;
    })
  );
}
