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

// <docs markdown="../readme.md#useCleanup">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useCleanup instead)
/**
 * A lazy-loadable reference to a component's cleanup hook.
 *
 * Invoked when the component is destroyed (removed from render tree), or paused as part of the
 * SSR serialization.
 *
 * Can be used to release resouces, abort network requets, stop timers...
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   useCleanup$(() => {
 *     // Executed after SSR (pause) or when the component gets removed from the DOM.
 *     // Can be used to release resouces, abort network requets, stop timers...
 *     console.log('component is destroyed');
 *   });
 *   return <div>Hello world</div>;
 * });
 * ```
 *
 * @alpha
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

// <docs markdown="../readme.md#useCleanup">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useCleanup instead)
/**
 * A lazy-loadable reference to a component's cleanup hook.
 *
 * Invoked when the component is destroyed (removed from render tree), or paused as part of the
 * SSR serialization.
 *
 * Can be used to release resouces, abort network requets, stop timers...
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   useCleanup$(() => {
 *     // Executed after SSR (pause) or when the component gets removed from the DOM.
 *     // Can be used to release resouces, abort network requets, stop timers...
 *     console.log('component is destroyed');
 *   });
 *   return <div>Hello world</div>;
 * });
 * ```
 *
 * @alpha
 */
// </docs>
export const useCleanup$ = implicit$FirstArg(useCleanupQrl);

// <docs markdown="../readme.md#useResume">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useResume instead)
/**
 * A lazy-loadable reference to a component's on resume hook.
 *
 * The hook is eagerly invoked when the application resumes on the client. Because it is called
 * eagerly, this allows the component to resume even if no user interaction has taken place.
 *
 * Only called in the client.
 * Only called once.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   useResume$(() => {
 *     // Eagerly invoked when the application resumes on the client
 *     console.log('called once in client');
 *   });
 *   return <div>Hello world</div>;
 * });
 * ```
 *
 * @see `useVisible`, `useClientEffect`
 *
 * @alpha
 */
// </docs>
export function useResumeQrl(resumeFn: QRL<() => void>): void {
  useOn('qresume', resumeFn);
}

// <docs markdown="../readme.md#useResume">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useResume instead)
/**
 * A lazy-loadable reference to a component's on resume hook.
 *
 * The hook is eagerly invoked when the application resumes on the client. Because it is called
 * eagerly, this allows the component to resume even if no user interaction has taken place.
 *
 * Only called in the client.
 * Only called once.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   useResume$(() => {
 *     // Eagerly invoked when the application resumes on the client
 *     console.log('called once in client');
 *   });
 *   return <div>Hello world</div>;
 * });
 * ```
 *
 * @see `useVisible`, `useClientEffect`
 *
 * @alpha
 */
// </docs>
export const useResume$ = implicit$FirstArg(useResumeQrl);

// <docs markdown="../readme.md#useVisible">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useVisible instead)
/**
 * A lazy-loadable reference to a component's on visible hook.
 *
 * The hook is lazily invoked when the component becomes visible in the browser viewport.
 *
 * Only called in the client.
 * Only called once.
 *
 * @see `useResume`, `useClientEffect`
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     isVisible: false,
 *   });
 *   useVisible$(() => {
 *     // Invoked once when the component is visible in the browser's viewport
 *     console.log('called once in client when visible');
 *     store.isVisible = true;
 *   });
 *   return <div>{store.isVisible}</div>;
 * });
 * ```
 *
 * @alpha
 */
// </docs>
export function useVisibleQrl(resumeFn: QRL<() => void>): void {
  useOn('qvisible', resumeFn);
}

// <docs markdown="../readme.md#useVisible">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useVisible instead)
/**
 * A lazy-loadable reference to a component's on visible hook.
 *
 * The hook is lazily invoked when the component becomes visible in the browser viewport.
 *
 * Only called in the client.
 * Only called once.
 *
 * @see `useResume`, `useClientEffect`
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     isVisible: false,
 *   });
 *   useVisible$(() => {
 *     // Invoked once when the component is visible in the browser's viewport
 *     console.log('called once in client when visible');
 *     store.isVisible = true;
 *   });
 *   return <div>{store.isVisible}</div>;
 * });
 * ```
 *
 * @alpha
 */
// </docs>
export const useVisible$ = implicit$FirstArg(useVisibleQrl);

// <docs markdown="../readme.md#useOn">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOn instead)
/**
 * Register a listener on the current component's host element.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX. Otherwise it's adding a JSX listener in the `<Host>` is a better idea.
 *
 * @see `useOn`, `useOnWindow`, `useOnDocument`.
 *
 * @alpha
 */
// </docs>
export function useOn(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on:${event}`, eventFn);
}

// <docs markdown="../readme.md#useOnDocument">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOnDocument instead)
/**
 * Register a listener on `document`.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX.
 *
 * @see `useOn`, `useOnWindow`, `useOnDocument`.
 *
 * ```tsx
 * function useScroll() {
 *   useOnDocument(
 *     'scroll',
 *     $(() => {
 *       console.log('body scrolled');
 *     })
 *   );
 * }
 *
 * const Cmp = component$(() => {
 *   useScroll();
 *   return <Host>Profit!</Host>;
 * });
 * ```
 *
 * @alpha
 */
// </docs>
export function useOnDocument(event: string, eventQrl: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on-document:${event}`, eventQrl);
}

// <docs markdown="../readme.md#useOnWindow">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOnWindow instead)
/**
 * Register a listener on `window`.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX.
 *
 * @see `useOn`, `useOnWindow`, `useOnDocument`.
 *
 * ```tsx
 * function useAnalytics() {
 *   useOnWindow(
 *     'popstate',
 *     $(() => {
 *       console.log('navigation happened');
 *       // report to analytics
 *     })
 *   );
 * }
 *
 * const Cmp = component$(() => {
 *   useAnalytics();
 *   return <Host>Profit!</Host>;
 * });
 * ```
 *
 * @alpha
 */
// </docs>
export function useOnWindow(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on-window:${event}`, eventFn);
}

// <docs markdown="../readme.md#useStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useStyles instead)
/**
 * A lazy-loadable reference to a component's styles.
 *
 * Component styles allow Qwik to lazy load the style information for the component only when
 * needed. (And avoid double loading it in case of SSR hydration.)
 *
 * ```tsx
 * import styles from './code-block.css?inline';
 *
 * export const CmpStyles = component$(() => {
 *   useStyles$(styles);
 *
 *   return <Host>Some text</Host>;
 * });
 * ```
 *
 * @see `useScopedStyles`.
 *
 * @public
 */
// </docs>
export function useStylesQrl(styles: QRL<string>): void {
  _useStyles(styles, false);
}

// <docs markdown="../readme.md#useStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useStyles instead)
/**
 * A lazy-loadable reference to a component's styles.
 *
 * Component styles allow Qwik to lazy load the style information for the component only when
 * needed. (And avoid double loading it in case of SSR hydration.)
 *
 * ```tsx
 * import styles from './code-block.css?inline';
 *
 * export const CmpStyles = component$(() => {
 *   useStyles$(styles);
 *
 *   return <Host>Some text</Host>;
 * });
 * ```
 *
 * @see `useScopedStyles`.
 *
 * @public
 */
// </docs>
export const useStyles$ = implicit$FirstArg(useStylesQrl);

// <docs markdown="../readme.md#useScopedStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useScopedStyles instead)
/**
 * @see `useStyles`.
 *
 * @alpha
 */
// </docs>
export function useScopedStylesQrl(styles: QRL<string>): void {
  _useStyles(styles, true);
}

// <docs markdown="../readme.md#useScopedStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useScopedStyles instead)
/**
 * @see `useStyles`.
 *
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

/**
 * @public
 */
export type PublicProps<PROPS extends {}> = PROPS & On$Props<PROPS> & ComponentBaseProps;

/**
 * @public
 */
export type On$Props<T extends {}> = {
  [K in keyof T as K extends `${infer A}Qrl`
    ? NonNullable<T[K]> extends QRL
      ? `${A}$`
      : never
    : never]?: NonNullable<T[K]> extends QRL<infer B> ? B : never;
};

/**
 * @alpha
 */
export type EventHandler<T> = QRL<(value: T) => any>;

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
 * `useOnWindow`, `useStyles`, `useScopedStyles`
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
 * `useOnWindow`, `useStyles`, `useScopedStyles`
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
