import type { QRL } from '../import/qrl.public';
import { getContext } from '../props/props';
import { qPropWriteQRL } from '../props/props-on';
import { implicit$FirstArg } from '../util/implicit_dollar';
import { useHostElement } from './use-host-element.public';
import { useSequentialScope } from './use-store.public';
import { WatchDescriptor, WatchFlagsIsCleanup } from './use-watch';

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
export const useCleanupQrl = (unmountFn: QRL<() => void>): void => {
  const [watch, setWatch, i] = useSequentialScope();
  if (!watch) {
    const el = useHostElement();
    const watch: WatchDescriptor = {
      qrl: unmountFn,
      el,
      f: WatchFlagsIsCleanup,
      i,
    };
    setWatch(true);
    getContext(el).$watches$.push(watch);
  }
};

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
export const useCleanup$ = /*#__PURE__*/ implicit$FirstArg(useCleanupQrl);

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
export const useResumeQrl = (resumeFn: QRL<() => void>): void => {
  useOn('qinit', resumeFn);
};

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
export const useResume$ = /*#__PURE__*/ implicit$FirstArg(useResumeQrl);

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
export const useVisibleQrl = (resumeFn: QRL<() => void>): void => {
  useOn('qvisible', resumeFn);
};

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
export const useVisible$ = /*#__PURE__*/ implicit$FirstArg(useVisibleQrl);

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
export const useOn = (event: string, eventFn: QRL<() => void>) => {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on:${event}`, eventFn);
};

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
export const useOnDocument = (event: string, eventQrl: QRL<() => void>) => {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on-document:${event}`, eventQrl);
};

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
export const useOnWindow = (event: string, eventFn: QRL<() => void>) => {
  const el = useHostElement();
  const ctx = getContext(el);
  qPropWriteQRL(undefined, ctx, `on-window:${event}`, eventFn);
};
