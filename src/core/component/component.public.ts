import { toQrlOrError } from '../import/qrl';
import type { QRLInternal } from '../import/qrl-class';
import { $, implicit$FirstArg, QRL, qrlImport } from '../import/qrl.public';
import { qPropWriteQRL, qrlFactory } from '../props/props-on';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { newInvokeContext, useInvoke, useWaitOn } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';
import { ComponentScopedStyles, OnRenderProp } from '../util/markers';
import { styleKey } from './qrl-styles';
import type { ComponentBaseProps } from '../render/jsx/types/jsx-qwik-attributes';
import type { ValueOrPromise } from '../util/types';
import { getContext, getProps } from '../props/props';
import { jsx, FunctionComponent } from '../index';
import { getDocument } from '../util/dom';

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onUnmount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onUnmount instead)
/**
 * A lazy-loadable reference to a component's destroy hook.
 *
 * Invoked when the component is destroyed (removed from render tree).
 *
 * @public
 */
// </docs>
export function onUnmountFromQrl(unmountFn: QRL<() => void>): void {
  throw new Error('IMPLEMENT: onUnmount' + unmountFn);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onUnmount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onUnmount instead)
/**
 * A lazy-loadable reference to a component's destroy hook.
 *
 * Invoked when the component is destroyed (removed from render tree).
 *
 * @public
 */
// </docs>
export const onUnmount$ = implicit$FirstArg(onUnmountFromQrl);

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onResume">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onResume instead)
/**
 * A lazy-loadable reference to a component's on resume hook.
 *
 * The hook is eagerly invoked when the application resumes on the client. Because it is called
 * eagerly, this allows the component to hydrate even if no user interaction has taken place.
 *
 * @public
 */
// </docs>
export function onResumeFromQrl(resumeFn: QRL<() => void>): void {
  throw new Error('IMPLEMENT: onRender' + resumeFn);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onResume">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onResume instead)
/**
 * A lazy-loadable reference to a component's on resume hook.
 *
 * The hook is eagerly invoked when the application resumes on the client. Because it is called
 * eagerly, this allows the component to hydrate even if no user interaction has taken place.
 *
 * @public
 */
// </docs>
export const onResume$ = implicit$FirstArg(onResumeFromQrl);

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onHydrate">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onHydrate instead)
/**
 * A lazy-loadable reference to a component's on hydrate hook.
 *
 * Invoked when the component's state is re-hydrated from serialization. This allows the
 * component to do any work to re-activate itself.
 *
 * @public
 */
// </docs>
export function onHydrateFromQrl(hydrateFn: QRL<() => void>): void {
  throw new Error('IMPLEMENT: onHydrate' + hydrateFn);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onHydrate">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onHydrate instead)
/**
 * A lazy-loadable reference to a component's on hydrate hook.
 *
 * Invoked when the component's state is re-hydrated from serialization. This allows the
 * component to do any work to re-activate itself.
 *
 * @public
 */
// </docs>
export const onHydrate$ = implicit$FirstArg(onHydrateFromQrl);

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onDehydrate">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onDehydrate instead)
/**
 * A lazy-loadable reference to a component's on dehydrate hook.
 *
 * Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows
 * the component to do last-minute clean-up before its state is serialized.
 *
 * Typically used with transient state.
 *
 * @public
 */
// </docs>
export function onDehydrateFromQrl(dehydrateFn: QRL<() => void>): void {
  throw new Error('IMPLEMENT: onDehydrate' + dehydrateFn);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onDehydrate">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onDehydrate instead)
/**
 * A lazy-loadable reference to a component's on dehydrate hook.
 *
 * Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows
 * the component to do last-minute clean-up before its state is serialized.
 *
 * Typically used with transient state.
 *
 * @public
 */
// </docs>
export const onDehydrate$ = implicit$FirstArg(onDehydrateFromQrl);

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#on">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#on instead)
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
export function on(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on:${event}`, eventFn);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onDocument">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onDocument instead)
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
export function onDocument(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on-document:${event}`, eventFn);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#onWindow">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#onWindow instead)
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
export function onWindow(event: string, eventFn: QRL<() => void>) {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, 'on-w' + `indow:${event}`, eventFn);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useStyles instead)
/**
 * Refer to component styles.
 *
 * @alpha
 */
// </docs>
export function useStylesFromQrl(styles: QRL<string>): void {
  _useStyles(styles, false);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useStyles instead)
/**
 * Refer to component styles.
 *
 * @alpha
 */
// </docs>
export const useStyles$ = implicit$FirstArg(useStylesFromQrl);

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useScopedStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useScopedStyles instead)
/**
 * @alpha
 */
// </docs>
export function useScopedStylesFromQrl(styles: QRL<string>): void {
  _useStyles(styles, true);
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#useScopedStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#useScopedStyles instead)
/**
 * @alpha
 */
// </docs>
export const useScopedStyles$ = implicit$FirstArg(useScopedStylesFromQrl);

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
export type PropsOf<COMP extends (props: any) => JSXNode> = COMP extends (
  props: infer PROPS
) => JSXNode<any>
  ? PROPS
  : never;

/**
 * @public
 */
export interface ComponentOptions {
  tagName?: string;
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#component instead)
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
 *   return $(() => (
 *     <div>
 *       <span>{state.count}</span>
 *       <button on$:click={() => (state.count += props.step || 1)}>+</button>
 *     </div>
 *   ));
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
 *   return $(() => <Counter value={100} />);
 * });
 * ```
 *
 * See also: `component`, `onUnmount`, `onHydrate`, `onDehydrate`, `onHalt`, `onResume`, `on`,
 * `onDocument`, `onWindow`, `useStyles`, `useScopedStyles`
 *
 * @param onMount - Initialization closure used when the component is first created.
 * @param tagName - Optional components options. It can be used to set a custom tag-name to be
 * used for the component's host element.
 *
 * @public
 */
// </docs>
export function componentFromQrl<PROPS extends {}>(
  onMount: QRL<OnMountFn<PROPS>>,
  options?: ComponentOptions
): (props: PROPS & ComponentBaseProps) => JSXNode<PROPS>;
/**
 * @public
 */
export function componentFromQrl<PROPS extends {}>(
  onMount: QRL<OnMountFn<PROPS>>,
  options: ComponentOptions = {}
): FunctionComponent<PROPS & ComponentBaseProps> {
  const tagName = options.tagName ?? 'div';

  // Return a QComponent Factory function.
  return function QComponent(props, key): JSXNode<PROPS> {
    const onRenderFactory: qrlFactory = async (hostElement: Element): Promise<QRLInternal> => {
      // Turn function into QRL
      const onMountQrl = toQrlOrError(onMount);
      const onMountFn = await resolveQrl(hostElement, onMountQrl);
      const ctx = getContext(hostElement);
      const props = getProps(ctx) as any;
      const invokeCtx = newInvokeContext(hostElement, hostElement);
      return useInvoke(invokeCtx, onMountFn, props) as QRLInternal;
    };
    onRenderFactory.__brand__ = 'QRLFactory';

    return jsx(tagName, { [OnRenderProp]: onRenderFactory, ...props }, key) as any;
  };
}

// <docs markdown="https://hackmd.io/c_nNpiLZSYugTU0c5JATJA#component">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2Fc_nNpiLZSYugTU0c5JATJA%3Fboth#component instead)
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
 *   return $(() => (
 *     <div>
 *       <span>{state.count}</span>
 *       <button on$:click={() => (state.count += props.step || 1)}>+</button>
 *     </div>
 *   ));
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
 *   return $(() => <Counter value={100} />);
 * });
 * ```
 *
 * See also: `component`, `onUnmount`, `onHydrate`, `onDehydrate`, `onHalt`, `onResume`, `on`,
 * `onDocument`, `onWindow`, `useStyles`, `useScopedStyles`
 *
 * @param onMount - Initialization closure used when the component is first created.
 * @param tagName - Optional components options. It can be used to set a custom tag-name to be
 * used for the component's host element.
 *
 * @public
 */
// </docs>
export function component$<PROPS extends {}>(
  onMount: OnMountFn<PROPS>,
  options?: ComponentOptions
): (props: PROPS & ComponentBaseProps) => JSXNode<PROPS> {
  return componentFromQrl<PROPS>($(onMount), options);
}

/**
 * @public
 */
export type OnMountFn<PROPS> = (
  props: PROPS
) => ValueOrPromise<QRL<() => ValueOrPromise<JSXNode<any>>>>;

function resolveQrl<PROPS extends {}>(
  hostElement: Element,
  onMountQrl: QRLInternal<OnMountFn<PROPS>>
): Promise<OnMountFn<PROPS>> {
  return onMountQrl.symbolRef
    ? Promise.resolve(onMountQrl.symbolRef!)
    : Promise.resolve(null).then(() => {
        return qrlImport<OnMountFn<PROPS>>(hostElement, onMountQrl);
      });
}

function _useStyles(styles: QRL<string>, scoped: boolean) {
  const styleQrl = toQrlOrError(styles);
  const styleId = styleKey(styleQrl);
  const hostElement = useHostElement();
  if (scoped) {
    hostElement.setAttribute(ComponentScopedStyles, styleId);
  }

  useWaitOn(
    qrlImport(hostElement, styleQrl).then((styleText) => {
      const document = getDocument(hostElement);
      const head = document.querySelector('head');
      if (head && !head.querySelector(`style[q\\:style="${styleId}"]`)) {
        const style = document.createElement('style');
        style.setAttribute('q:style', styleId);
        style.textContent = scoped ? styleText.replace(/�/g, styleId) : styleText;
        head.appendChild(style);
      }
    })
  );
}
