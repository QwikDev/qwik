import {
  implicit$FirstArg,
  noSerialize,
  useContext,
  useServerData,
  useVisibleTask$,
  type QRL,
} from '@builder.io/qwik';
import {
  ContentContext,
  DocumentHeadContext,
  RouteActionContext,
  RouteLocationContext,
  RouteNavigateContext,
  RoutePreventNavigateContext,
} from './contexts';
import type {
  RouteLocation,
  ResolvedDocumentHead,
  RouteNavigate,
  QwikCityEnvData,
  RouteAction,
  PreventNavigateCallback,
} from './types';

/** @public */
export const useContent = () => useContext(ContentContext);

/**
 * Returns the document head for the current page. The generic type describes the front matter.
 *
 * @public
 */
export const useDocumentHead = <
  FrontMatter extends Record<string, unknown> = Record<string, any>,
>(): Required<ResolvedDocumentHead<FrontMatter>> => useContext<any>(DocumentHeadContext);

/** @public */
export const useLocation = (): RouteLocation => useContext(RouteLocationContext);

/** @public */
export const useNavigate = (): RouteNavigate => useContext(RouteNavigateContext);

/** @internal Implementation of usePreventNavigate$ */
export const usePreventNavigateQrl = (fn: QRL<PreventNavigateCallback>): void => {
  if (!__EXPERIMENTAL__.preventNavigate) {
    throw new Error(
      'usePreventNavigate$ is experimental and must be enabled with `experimental: ["preventNavigate"]` in the `qwikVite` plugin.'
    );
  }
  const registerPreventNav = useContext(RoutePreventNavigateContext);
  // Note: we have to use a visible task because:
  // - the onbeforeunload event is synchronous, so we need to preload the callbacks
  // - to unregister the callback, we need to run code on unmount, which means a visible task
  // - it allows removing the onbeforeunload event listener when no callbacks are registered, which is better for older Firefox versions
  // - preventing navigation implies user interaction, so we'll need to load the framework anyway
  useVisibleTask$(() => registerPreventNav(fn));
};
/**
 * Prevent navigation attempts. This hook registers a callback that will be called before SPA or
 * browser navigation.
 *
 * Return `true` to prevent navigation.
 *
 * #### SPA Navigation
 *
 * For Single-Page-App (SPA) navigation (via `<Link />`, `const nav = useNavigate()`, and browser
 * backwards/forwards inside SPA history), the callback will be provided with the target, either a
 * URL or a number. It will only be a number if `nav(number)` was called to navigate forwards or
 * backwards in SPA history.
 *
 * If you return a Promise, the navigation will be blocked until the promise resolves.
 *
 * This can be used to show a nice dialog to the user, and wait for the user to confirm, or to
 * record the url, prevent the navigation, and navigate there later via `nav(url)`.
 *
 * #### Browser Navigation
 *
 * However, when the user navigates away by clicking on a regular `<a />`, reloading, or moving
 * backwards/forwards outside SPA history, this callback will not be awaited. This is because the
 * browser does not provide a way to asynchronously prevent these navigations.
 *
 * In this case, returning returning `true` will tell the browser to show a confirmation dialog,
 * which cannot be customized. You are also not able to show your own `window.confirm()` dialog
 * during the callback, the browser won't allow it. If you return a Promise, it will be considered
 * as `true`.
 *
 * When the callback is called from the browser, no url will be provided. Use this to know whether
 * you can show a dialog or just return `true` to prevent the navigation.
 *
 * @public
 */
export const usePreventNavigate$ = implicit$FirstArg(usePreventNavigateQrl);

export const useAction = (): RouteAction => useContext(RouteActionContext);

export const useQwikCityEnv = () => noSerialize(useServerData<QwikCityEnvData>('qwikcity'));
