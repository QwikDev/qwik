/**
 * Qwik Router Component
 *
 * This file contains the main Qwik Router component, which initializes the router and provides the
 * necessary context for it to work. It also contains the logic for handling navigation, including
 * updating the URL, managing scroll restoration, and resolving document head changes.
 *
 * Note: This component is designed to work both on the server and the client. During server-side
 * rendering (SSR), it initializes the router state based on the URL and route data provided by the
 * server environment. On the client, it handles navigation events and updates the router state
 * accordingly.
 *
 * SSR is _required_ for the initial load.
 *
 * The flow of navigation is as follows:
 *
 * 1. During SSR, the server environment parses the initial URL and collects the route data.
 * 2. It runs the middleware hooks (`onRequest`, `onGet`, `onPost`, etc.), and responds to q-loader,
 *    action$ and server$ requests.
 * 3. If SSR is deemed appropriate, the route data is provided via `useServerData` and this component
 *    uses it to initialize the router contexts, register Tasks, and render the Slot. This component
 *    will never render again.
 * 4. Then, slotted components like `<DocumentHeadTags />` and `<RouterOutlet />` can consume the route
 *    data to render the page.
 * 5. On the client, when a navigation event occurs, this calls `goto()`, which updates the URL in the
 *    same tick, loads the route data and adjusts the router context.
 * 6. The changed contexts trigger the slotted components to re-render with the new route data.
 *
 * Since the head data can depend on route loaders and they get their data asynchronously and can
 * update without navigation, the head is resolved in a separate Task that tracks the relevant
 * signals.
 */
import * as qwikRouterConfig from '@qwik-router-config';
import {
  $,
  component$,
  getLocale,
  isBrowser,
  isDev,
  isServer,
  noSerialize,
  Slot,
  useContextProvider,
  useServerData,
  useSignal,
  useStore,
  useStyles$,
  useTask$,
  type QRL,
} from '@qwik.dev/core';
import {
  _getContextContainer,
  _hasStoreEffects,
  _waitUntilRendered,
  createAsync$,
  forceStoreEffects,
  type AsyncSignal,
  type ClientContainer,
  type NoSerialize,
  type ValueOrPromise,
} from '@qwik.dev/core/internal';
import { clientNavigate } from './client-navigate';
import { Q_ROUTE } from './constants';
import { prefetchRoute } from './prefetch-route';
import {
  ContentContext,
  ContentInternalContext,
  DocumentHeadContext,
  HttpStatusContext,
  RouteActionContext,
  RouteLoaderCtxContext,
  RouteLocationContext,
  RouteNavigateContext,
  RoutePreventNavigateContext,
  RouteStateContext,
} from './contexts';
import { createDocumentHead, resolveHead } from './head';
import transitionCss from './qwik-view-transition.css?inline';
import { loadRoute } from './routing';
import {
  callRestoreScrollOnDocument,
  currentScrollState,
  getScrollHistory,
  restoreScroll,
  saveScrollHistory,
} from './scroll-restoration';
import spaInit from './spa-init';
import {
  ensureRouteLoaderSignals,
  setLoaderSignalValue,
  updateRouteLoaderPaths,
} from './route-loaders';
import type {
  Action,
  ActionInternal,
  ContentModule,
  ContentState,
  ContentStateInternal,
  DocumentHeadValue,
  Editable,
  EndpointResponse,
  LoadedRoute,
  Loader,
  LoaderInternal,
  MutableRouteLocation,
  NavigationType,
  PageModule,
  PreventNavigateCallback,
  ResolvedDocumentHead,
  RouteActionResolver,
  RouteActionValue,
  RouteNavigate,
  RouteStateInternal,
  ScrollState,
} from './types';
import { submitAction } from './use-endpoint';
import { useQwikRouterEnv } from './use-functions';
import { isSameOrigin, isSamePath, toPath, toUrl } from './utils';
import { startViewTransition, type ViewTransition } from './view-transition';

declare const window: ClientSPAWindow;

/**
 * @deprecated Use `QWIK_ROUTER_SCROLLER` instead (will be removed in V3)
 * @public
 */
export const QWIK_CITY_SCROLLER = '_qCityScroller';

/** @public */
export const QWIK_ROUTER_SCROLLER = '_qRouterScroller';

/** @public */
export interface QwikRouterProps {
  /**
   * Enable the ViewTransition API
   *
   * Default: `true`
   *
   * @see https://github.com/WICG/view-transitions/blob/main/explainer.md
   * @see https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
   * @see https://caniuse.com/mdn_api_viewtransition
   */
  viewTransition?: boolean;
}

/**
 * @deprecated Use `QwikRouterProps` instead. Will be removed in v3.
 * @public
 */
export type QwikCityProps = QwikRouterProps;

// Gets populated by registerPreventNav on the client
const preventNav: {
  $cbs$?: Set<QRL<PreventNavigateCallback>> | undefined;
  $handler$?: (event: BeforeUnloadEvent) => void;
} = {};

// Track navigations during prevent so we don't overwrite.
// We need to use an object so we can write into it from qrls.
const internalState: {
  navCount: number;
  currentTransition?: ViewTransition;
} = { navCount: 0 };

const getScroller = () => {
  let scroller = document.getElementById(QWIK_ROUTER_SCROLLER);
  if (!scroller) {
    scroller = document.getElementById(QWIK_CITY_SCROLLER);
    if (scroller && isDev) {
      console.warn(
        `Please update your scroller ID to "${QWIK_ROUTER_SCROLLER}" as "${QWIK_CITY_SCROLLER}" is deprecated and will be removed in V3`
      );
    }
  }
  return scroller ?? document.documentElement;
};

/**
 * @public
 * This hook initializes Qwik Router, providing the necessary context for it to work.
 *
 * This hook should be used once, at the root of your application.
 */
export const useQwikRouter = (props?: QwikRouterProps) => {
  if (!isServer) {
    throw new Error(
      'useQwikRouter can only run during SSR on the server. If you are seeing this, it means you are re-rendering the root of your application. Fix that or use the <QwikRouterProvider> component around the root of your application.'
    );
  }
  useStyles$(transitionCss);
  const env = useQwikRouterEnv();
  if (!env?.params) {
    throw new Error(
      `Missing Qwik Router Env Data for help visit https://github.com/QwikDev/qwik/issues/6237`
    );
  }

  const urlEnv = useServerData<string>('url');
  if (!urlEnv) {
    throw new Error(`Missing Qwik URL Env Data`);
  }
  const serverHead = useServerData<DocumentHeadValue>('documentHead');
  const manifestHash =
    useServerData<Record<string, string>>('containerAttributes')?.['q:manifest-hash'];

  if (
    env.ev.originalUrl.pathname !== env.ev.url.pathname &&
    !__EXPERIMENTAL__.enableRequestRewrite
  ) {
    throw new Error(
      `enableRequestRewrite is an experimental feature and is not enabled. Please enable the feature flag by adding \`experimental: ["enableRequestRewrite"]\` to your qwikVite plugin options.`
    );
  }

  const url = new URL(urlEnv);
  const routeLocationTarget: MutableRouteLocation = {
    url,
    params: env.params,
    isNavigating: false,
    prevUrl: undefined,
  };
  const routeLocation = useStore<MutableRouteLocation>(routeLocationTarget, { deep: false });
  const navResolver: { r?: () => void } = {};
  // Set manifestHash/pageUrl here since they're not available during middleware execution
  env.routeLoaderCtx.manifestHash = manifestHash || '';
  env.routeLoaderCtx.pageUrl = url;
  // deep: true so that changes to loaderPaths properties are tracked by AsyncSignal QRLs
  const routeLoaderCtx = useStore(env.routeLoaderCtx);
  // Create AsyncSignals whose QRL closures capture the store proxy for client-side reactivity.
  // Then set .value from middleware-computed loader values (inert, non-reactive data).
  const loaderState = useStore<Record<string, AsyncSignal<unknown>>>({}, { deep: false });
  const contentModulesForInit = env.loadedRoute.$mods$ as ContentModule[];
  const loaders = ensureRouteLoaderSignals(contentModulesForInit, loaderState, routeLoaderCtx);
  for (const loader of loaders) {
    const value = env.loaderValues[loader.__id];
    if (value !== undefined) {
      setLoaderSignalValue(loaderState[loader.__id], value);
    }
  }

  // The initial state of routeInternal uses the URL provided by the server environment.
  // It may not be accurate to the actual URL the browser is accessing the site from.
  // It is useful for the purposes of SSR and SSG, but may be overridden browser-side
  // if needed for SPA routing.
  const routeInternal = useSignal<RouteStateInternal>({
    type: 'initial',
    dest: url,
    scroll: true,
  });
  const documentHead = useStore<Editable<ResolvedDocumentHead>>(() =>
    createDocumentHead(serverHead, manifestHash)
  );
  const content = useStore<Editable<ContentState>>({
    headings: undefined,
    menu: undefined,
  });

  const contentInternal = useSignal<ContentStateInternal>();

  /**
   * Non-serializable navigation context passed from the nav task to the head+commit task. Only the
   * data that can't be derived from existing stores/signals.
   */
  const navContext = useSignal<
    NoSerialize<{
      routeName: string;
      navType: NavigationType;
      replaceState: boolean | undefined;
      shouldForcePrevUrl: boolean;
      shouldForceUrl: boolean;
      shouldForceParams: boolean;
      navCount: number;
    }>
  >();

  const httpStatus = useSignal({
    status: env.response.status,
    message: env.loadedRoute.$notFound$
      ? 'Not Found'
      : ((env.response.statusMessage as string) ?? ''),
  });

  const currentActionId = env.response.action;
  const currentAction = currentActionId ? env.response.actionResult : undefined;
  const actionState = useSignal<RouteActionValue>(
    currentAction
      ? {
          id: currentActionId!,
          data: env.response.formData,
          output: {
            result: currentAction,
            status: env.response.status,
          },
        }
      : undefined
  );
  const actionDataSignal = useSignal<
    { action?: string; actionResult?: unknown; status: number } | undefined
  >(
    currentActionId
      ? {
          action: currentActionId,
          actionResult: currentAction,
          status: env.response.status,
        }
      : undefined
  );
  const registerPreventNav = $((fn$: QRL<PreventNavigateCallback>) => {
    if (!isBrowser) {
      return;
    }
    preventNav.$handler$ ||= (event: BeforeUnloadEvent) => {
      // track navigations during prevent so we don't overwrite
      internalState.navCount++;
      if (!preventNav.$cbs$) {
        return;
      }
      const prevents = [...preventNav.$cbs$.values()].map((cb) =>
        cb.resolved ? cb.resolved() : cb()
      );
      // this catches both true and Promise<any>
      // we assume a Promise means to prevent the navigation
      if (prevents.some(Boolean)) {
        event.preventDefault();
        // legacy support
        event.returnValue = true;
      }
    };

    (preventNav.$cbs$ ||= new Set()).add(fn$);
    // we need the QRLs to be synchronous if possible, for the beforeunload event
    fn$.resolve();
    window.addEventListener('beforeunload', preventNav.$handler$);

    return () => {
      if (preventNav.$cbs$) {
        preventNav.$cbs$.delete(fn$);
        if (!preventNav.$cbs$.size) {
          preventNav.$cbs$ = undefined;
          // unregister the event listener if no more callbacks, to make older Firefox happy
          window.removeEventListener('beforeunload', preventNav.$handler$!);
        }
      }
    };
  });

  /**
   * This is the `nav()` function that `useNavigation()` returns. It is also used internally for SPA
   * navigations and is provided in context for use in loaders and actions.
   *
   * Note: when goto is called, the address bar change must happen in the same tick for Safari to
   * treat it as a user-initiated navigation and allow scroll restoration to work. For this reason,
   * make sure to change the address bar before awaiting anything.
   */
  const goto: RouteNavigate = $(async (path, opt) => {
    const {
      type = 'link',
      forceReload = path === undefined, // Hack for nav() because this API is already set.
      replaceState = false,
      scroll = true,
    } = typeof opt === 'object' ? opt : { forceReload: opt };
    internalState.navCount++;
    internalState.currentTransition?.skipTransition();

    // If this is the first SPA navigation, we rewrite routeInternal's URL
    // as the browser location URL to prevent an erroneous origin mismatch.
    // The initial value of routeInternal is derived from the server env,
    // which in the case of SSG may not match the actual origin the site
    // is deployed on.
    // We only do this for link navigations, as popstate will have already changed the URL
    if (isBrowser && type === 'link' && routeInternal.value.type === 'initial') {
      const url = new URL(window.location.href);
      routeInternal.value.dest = url;
      routeLocation.url = url;
    }

    const lastDest = routeInternal.value.dest;
    const dest =
      path === undefined
        ? lastDest
        : typeof path === 'number'
          ? path
          : toUrl(path, routeLocation.url);

    if (
      preventNav.$cbs$ &&
      (forceReload ||
        typeof dest === 'number' ||
        !isSamePath(dest, lastDest) ||
        !isSameOrigin(dest, lastDest))
    ) {
      const ourNavId = internalState.navCount;
      const prevents = await Promise.all([...preventNav.$cbs$.values()].map((cb) => cb(dest)));
      if (ourNavId !== internalState.navCount || prevents.some(Boolean)) {
        if (ourNavId === internalState.navCount && type === 'popstate') {
          // Popstate events are not cancellable, so we push to undo
          // TODO keep state?
          history.pushState(null, '', lastDest);
        }
        return;
      }
    }

    if (typeof dest === 'number') {
      if (isBrowser) {
        history.go(dest);
      }
      return;
    }

    if (!isSameOrigin(dest, lastDest)) {
      // Cross-origin nav() should always abort early.
      if (isBrowser) {
        location.href = dest.href;
      }
      return;
    }

    if (!forceReload && isSamePath(dest, lastDest)) {
      if (isBrowser) {
        // Use `location.href` because the lastDest signal is only updated on page navigates.
        if (type === 'link' && dest.href !== location.href) {
          history.pushState(null, '', dest);
        }

        // Always scroll on same-page popstates, #hash clicks, or links.
        const scroller = getScroller();

        restoreScroll(type, dest, new URL(location.href), scroller, getScrollHistory());

        if (type === 'popstate') {
          window._qRouterScrollEnabled = true;
        }
      }

      // Update routeLocation.url on hash/search-only changes so components react to the new URL
      if (dest.href !== routeLocation.url.href) {
        const newUrl = new URL(dest.href);
        routeInternal.value.dest = newUrl;
        routeLocation.url = newUrl;
      }

      return;
    }

    let historyUpdated = false;
    if (isBrowser && type === 'link' && !forceReload) {
      // WebKit on iOS may treat async pushState() calls as skippable history entries.
      // Commit the navigation entry while the original tap/click is still active.
      const scroller = getScroller();

      window._qRouterScrollEnabled = false;
      clearTimeout(window._qRouterScrollDebounce);

      const scrollState = currentScrollState(scroller);
      saveScrollHistory(scrollState);
      clientNavigate(window, type, new URL(location.href), dest, replaceState);
      historyUpdated = true;
    }

    routeInternal.value = {
      type,
      dest,
      forceReload,
      replaceState,
      scroll,
      historyUpdated,
    };

    if (isBrowser) {
      // Prefetch: start loading route bundles and optionally loader data
      prefetchRoute(dest, true, 0.8, manifestHash);
    }

    actionState.value = undefined;
    routeLocation.isNavigating = true;

    return new Promise<void>((resolve) => {
      navResolver.r = resolve;
    });
  });

  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(HttpStatusContext, httpStatus);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteLoaderCtxContext, routeLoaderCtx);
  // Set goto on the loader context so async loader fetch can do SPA redirects
  routeLoaderCtx.goto = goto as any;
  useContextProvider(RouteActionContext, actionState);
  useContextProvider<any>(RoutePreventNavigateContext, registerPreventNav);

  /**
   * This is split in 3 tasks because we need to update the head once we figured out the route, and
   * before we trigger the render, and we need to subscribe only head to loader signal updates
   */
  useTask$(
    async ({ track }) => {
      const navigation = track(routeInternal);
      const action = track(actionState);

      const prevUrl = routeLocation.url;
      const navType = action ? 'form' : navigation.type;
      const replaceState = navigation.replaceState;
      // Capture navCount at task entry. If another goto() fires while we're awaiting
      // loadRoute or loaders, navCount will have been bumped and we should bail so
      // the task's next invocation takes over with the newer destination.
      const navCountBefore = internalState.navCount;
      let trackUrl: URL;
      let endpointResponse: EndpointResponse | undefined;
      let actionData: { action?: string; actionResult?: unknown; status: number } | undefined;
      let loadedRoute: LoadedRoute;
      if (isServer) {
        // server
        trackUrl = new URL(navigation.dest, routeLocation.url);
        loadedRoute = env!.loadedRoute;
        endpointResponse = env!.response;
        actionData = endpointResponse;
      } else {
        // client
        trackUrl = new URL(navigation.dest, location as any as URL);

        // ensure correct trailing slash
        if (trackUrl.pathname.endsWith('/')) {
          if (globalThis.__NO_TRAILING_SLASH__) {
            trackUrl.pathname = trackUrl.pathname.slice(0, -1);
          }
        } else if (!globalThis.__NO_TRAILING_SLASH__) {
          trackUrl.pathname += '/';
        }
        const loadRoutePromise = loadRoute(
          qwikRouterConfig.routes,
          qwikRouterConfig.cacheModules,
          trackUrl.pathname
        );
        try {
          loadedRoute = await loadRoutePromise;
        } catch (e) {
          console.error(`Could not load route ${trackUrl.pathname}, reloading:`, e);
          window.location.href = trackUrl.href;
          return;
        }
        // Bail if a second nav() was fired while we were loading route modules.
        if (internalState.navCount !== navCountBefore) {
          return;
        }

        // Submit action if one was triggered
        if (action) {
          const result = await submitAction(action, trackUrl.pathname);
          if (!result) {
            // HTTP redirect happened — bail
            routeInternal.untrackedValue = { type: navType, dest: trackUrl };
            return;
          }

          actionData = {
            status: result.status,
            action: action.id,
            actionResult: result.result,
          };

          // Resolve the action promise
          if (action.resolve) {
            action.resolve({
              status: result.status,
              result: result.result,
            });
          }

          // Apply loader updates from action result via setLoaderSignalValue.
          // This preserves track() subscriptions for future re-computations.
          if (result.loaderValues) {
            for (const [id, value] of Object.entries(result.loaderValues)) {
              const signal = loaderState[id];
              if (signal) {
                setLoaderSignalValue(signal, value);
              }
            }
          }
          if (result.loaderHashes) {
            for (const hash of result.loaderHashes) {
              loaderState[hash]?.invalidate(true);
            }
          }
        }
      }

      const { $routeName$, $params$, $mods$, $menu$, $notFound$ } = loadedRoute;
      const contentModules = $mods$ as ContentModule[];
      updateRouteLoaderPaths(routeLoaderCtx, loadedRoute.$loaderPaths$, trackUrl);
      const routeLoaders = ensureRouteLoaderSignals(contentModules, loaderState, routeLoaderCtx);
      if (routeLoaders.length > 0) {
        // Trigger loader signals to fetch data for the new route. No await —
        // we want to render ASAP. Loaders update the page when they resolve,
        // and SSR awaits them on the server side. A loader that redirects
        // fires goto() directly; the new nav starts while this one finishes
        // committing, producing a brief flash of the current page.
        for (let i = 0; i < routeLoaders.length; i++) {
          const loader = routeLoaders[i];
          // trigger load
          loaderState[loader.__id].untrackedLoading;
        }
      }
      if (internalState.navCount !== navCountBefore) {
        return;
      }

      // Update httpStatus for 404/error pages
      if ($notFound$) {
        httpStatus.value = { status: 404, message: 'Not Found' };
      } else if (endpointResponse) {
        httpStatus.value = {
          status: endpointResponse.status,
          message: endpointResponse.statusMessage ?? 'OK',
        };
      } else if (actionData) {
        httpStatus.value = { status: actionData.status, message: 'OK' };
      } else {
        httpStatus.value = { status: 200, message: 'OK' };
      }
      const pageModule = contentModules[contentModules.length - 1] as PageModule;

      // Restore search params unless it's a redirect
      if (navigation.dest.search && !!isSamePath(trackUrl, prevUrl)) {
        trackUrl.search = navigation.dest.search;
      }
      let shouldForcePrevUrl = false;
      let shouldForceUrl = false;
      let shouldForceParams = false;
      // Update route location
      if (!isSamePath(trackUrl, prevUrl)) {
        if (_hasStoreEffects(routeLocation, 'prevUrl')) {
          shouldForcePrevUrl = true;
        }
        routeLocationTarget.prevUrl = prevUrl;
      }

      if (routeLocationTarget.url !== trackUrl) {
        if (_hasStoreEffects(routeLocation, 'url')) {
          shouldForceUrl = true;
        }
        routeLocationTarget.url = trackUrl;
      }

      if (routeLocationTarget.params !== $params$) {
        if (_hasStoreEffects(routeLocation, 'params')) {
          shouldForceParams = true;
        }
        routeLocationTarget.params = $params$;
      }

      routeInternal.untrackedValue = {
        type: navType,
        dest: trackUrl,
        forceReload: navigation.forceReload,
        replaceState: navigation.replaceState,
        scroll: navigation.scroll,
        historyUpdated: navigation.historyUpdated,
      };

      // Update content.
      // IMPORTANT: contentInternal must use .untrackedValue, NOT .value. Subscribers
      // (RouterOutlet, head task) are fired later by contentInternal.trigger()
      // inside navigate(), which runs inside the view-transition's update callback.
      // Using .value here would fire subscribers before startViewTransition captures
      // the old DOM, breaking view transitions (the update callback never gets invoked).
      content.headings = pageModule.headings;
      content.menu = $menu$;
      contentInternal.untrackedValue = noSerialize(contentModules);
      actionDataSignal.value = actionData;

      // Preserve historyUpdated/scroll/etc. for the commit task. Without this, the
      // commit task reads `navigation.historyUpdated` as undefined and calls
      // clientNavigate a second time, pushing an extra history entry.

      // hand off to next tasks
      navContext.value = noSerialize({
        routeName: $routeName$,
        navType,
        replaceState,
        shouldForcePrevUrl,
        shouldForceUrl,
        shouldForceParams,
        navCount: navCountBefore,
      });
    },
    // We should only wait for head calculation to complete on the server
    { deferUpdates: isServer }
  );

  /**
   * Calc head. This is in a separate task so that loader updates can trigger head recalculation
   * without re-running the navigation logic.
   *
   * Note that on the server these tasks run sequentially.
   */
  useTask$(
    ({ track }) => {
      const contentModules = track(contentInternal);
      if (!contentModules) {
        return;
      }
      const actionData = track(actionDataSignal);

      // Resolve head — this might throw a promise so keep it near the top of the function
      const head = track(() =>
        resolveHead(
          actionData,
          loaderState,
          routeLocation,
          contentModules,
          getLocale(''),
          serverHead
        )
      );
      documentHead.links = head.links;
      documentHead.meta = head.meta;
      documentHead.styles = head.styles;
      documentHead.scripts = head.scripts;
      documentHead.title = head.title;
      documentHead.frontmatter = head.frontmatter;
    },
    { deferUpdates: isServer }
  );

  /** Actual navigation */
  useTask$(
    ({ track }) => {
      const nav = track(navContext);
      if (isServer || !nav) {
        return;
      }

      if (nav.navCount !== internalState.navCount) {
        navResolver.r?.();
        return;
      }

      const container = _getContextContainer();
      const navigation = routeInternal.untrackedValue;

      const { navType, replaceState, routeName } = nav;
      const trackUrl = routeLocation.url;
      // prevUrl is only assigned when the path changes (see nav task). On the first SPA nav
      // after SSR, or on same-path/hash-only navs, prevUrl is undefined — fall back to
      // trackUrl so isSamePath() returns true and scroll/history logic no-ops correctly.
      const prevUrl = routeLocation.prevUrl ?? trackUrl;

      const scroller = getScroller();
      // Scroll restore setup — must happen before navigation commits
      let scrollState: ScrollState | undefined;
      if (navType === 'popstate') {
        scrollState = getScrollHistory();
      }
      if (
        (navigation.scroll &&
          (!navigation.forceReload || !isSamePath(trackUrl, prevUrl)) &&
          (navType === 'link' || navType === 'popstate')) ||
        // Action might have responded with a redirect.
        (navType === 'form' && !isSamePath(trackUrl, prevUrl))
      ) {
        // Mark next DOM render to scroll.
        (document as any).__q_scroll_restore__ = () =>
          restoreScroll(navType, trackUrl, prevUrl, scroller, scrollState);
      }

      initializeSPA(goto, scroller);

      if (navType !== 'popstate') {
        window._qRouterScrollEnabled = false;
        clearTimeout(window._qRouterScrollDebounce);

        if (!navigation.historyUpdated) {
          // Save the final scroll state before pushing new state.
          // Upgrades/replaces state with scroll pos on nav as needed.
          const scrollState = currentScrollState(scroller);
          saveScrollHistory(scrollState);
        }
      }

      const navigate = () => {
        if (nav.navCount !== internalState.navCount) {
          return Promise.resolve();
        }
        if (navigation.historyUpdated) {
          const currentPath = location.pathname + location.search + location.hash;
          const nextPath = toPath(trackUrl);
          if (currentPath !== nextPath) {
            // The history entry was already created under the original user gesture.
            // We only normalize the current entry here once async navigation resolves.
            history.replaceState(history.state, '', nextPath);
          }
        } else {
          clientNavigate(window, navType, prevUrl, trackUrl, replaceState);
        }
        contentInternal.trigger();
        return _waitUntilRendered(container!);
      };

      const _waitNextPage = () => {
        if (props?.viewTransition === false || !('startViewTransition' in document)) {
          return navigate().then(() => undefined as ViewTransition | undefined);
        }
        const { ready, transition } = startViewTransition({
          update: navigate,
          types: ['qwik-navigation'],
        });
        internalState.currentTransition = transition;
        return ready.then(() => transition);
      };
      _waitNextPage().finally(() => {
        internalState.currentTransition = undefined;
        (container as ClientContainer).element.setAttribute?.(Q_ROUTE, routeName);
        const scrollState = currentScrollState(scroller);
        saveScrollHistory(scrollState);
        window._qRouterScrollEnabled = true;
        callRestoreScrollOnDocument();

        if (nav.shouldForcePrevUrl) {
          forceStoreEffects(routeLocation, 'prevUrl');
        }
        if (nav.shouldForceUrl) {
          forceStoreEffects(routeLocation, 'url');
        }
        if (nav.shouldForceParams) {
          forceStoreEffects(routeLocation, 'params');
        }
        routeLocation.isNavigating = false;
        navResolver.r?.();
      });
    },
    { deferUpdates: false }
  );
};

/** @public This is a wrapper around the `useQwikRouter()` hook. We recommend using the hook instead of this component, unless you have a good reason to make your root component reactive. */
export const QwikRouterProvider = component$<QwikRouterProps>((props) => {
  // Initialize Qwik Router; since this component is not reactive, the hook only runs once.
  useQwikRouter(props);
  return <Slot />;
});

/**
 * @deprecated Use `useQwikRouter()` instead. Will be removed in v3.
 * @public
 */
export const QwikCityProvider = QwikRouterProvider;

/** @public */
export interface QwikRouterMockLoaderProp<T = any> {
  /** The loader function to mock. */
  loader: Loader<T>;

  /** The data to return when the loader is called. */
  data: T;
}

/** @public */
export interface QwikRouterMockActionProp<T = any> {
  /** The action function to mock. */
  action: Action<T>;

  /** The QRL function that will be called when the action is submitted. */
  handler: QRL<(data: T) => ValueOrPromise<RouteActionResolver>>;
}

/** @public */
export interface QwikRouterMockProps {
  /**
   * Allow mocking the url returned by `useLocation` hook.
   *
   * Default: `http://localhost/`
   */
  url?: string;

  /** Allow mocking the route params returned by `useLocation` hook. */
  params?: Record<string, string>;

  /** Allow mocking the `goto` function returned by `useNavigate` hook. */
  goto?: RouteNavigate;

  /**
   * Allow mocking data for loaders defined with `routeLoader$` function.
   *
   * ```
   * [
   *   {
   *     loader: useProductData,
   *     data: { product: { name: 'Test Product' } },
   *   },
   * ];
   * ```
   */
  loaders?: Array<QwikRouterMockLoaderProp<any>>;

  /**
   * Allow mocking actions defined with `routeAction$` function.
   *
   * ```
   * [
   *   {
   *     action: useAddUser,
   *     handler: $(async (data) => {
   *       console.log('useAddUser action called with data:', data);
   *     }),
   *   },
   * ];
   * ```
   */
  actions?: Array<QwikRouterMockActionProp<any>>;
}

/**
 * @deprecated Use `QwikRouterMockProps` instead. will be removed in V3
 * @public
 */
export type QwikCityMockProps = QwikRouterMockProps;

/** @public */
const useQwikMockRouter = (props: QwikRouterMockProps) => {
  const urlEnv = props.url ?? 'http://localhost/';
  const url = new URL(urlEnv);
  const routeLocation = useStore<MutableRouteLocation>(
    {
      url,
      params: props.params ?? {},
      isNavigating: false,
      prevUrl: undefined,
    },
    { deep: false }
  );

  const loadersData = props.loaders?.reduce(
    (acc, { loader, data }) => {
      acc[(loader as LoaderInternal).__id] = data;
      return acc;
    },
    {} as Record<string, QwikRouterMockLoaderProp['data']>
  );
  const loadersState = useStore<Record<string, AsyncSignal<unknown>>>({}, { deep: false });
  for (const [loaderId, data] of Object.entries(loadersData ?? {})) {
    loadersState[loaderId] ||= createAsync$(async () => data, { initial: data });
  }

  const goto: RouteNavigate =
    props.goto ??
    $(async () => {
      console.warn('QwikRouterMockProvider: goto not provided');
    });

  const documentHead = useStore(createDocumentHead, { deep: false });

  const content = useStore<ContentState>(
    {
      headings: undefined,
      menu: undefined,
    },
    { deep: false }
  );

  const contentInternal = useSignal<ContentStateInternal>();

  const actionState = useSignal<RouteActionValue>();

  const httpStatus = useSignal({ status: 200, message: '' });

  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(HttpStatusContext, httpStatus);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteStateContext, loadersState);
  useContextProvider(RouteActionContext, actionState);

  const actionsMocks = props.actions?.reduce(
    (acc, { action, handler }) => {
      acc[(action as ActionInternal).__id] = handler;
      return acc;
    },
    {} as Record<string, QwikRouterMockActionProp['handler']>
  );

  useTask$(async ({ track }) => {
    const action = track(actionState);
    if (!action?.resolve) {
      return;
    }

    const mock = actionsMocks?.[action.id];
    if (mock) {
      const actionResult = await mock(action.data);
      action.resolve(actionResult);
    }
  });
};

/** @public */
export const QwikRouterMockProvider = component$<QwikRouterMockProps>((props) => {
  useQwikMockRouter(props);
  return <Slot />;
});

/**
 * @deprecated Use `useQwikMockRouter()` instead. Will be removed in V3
 * @public
 */
export const QwikCityMockProvider = QwikRouterMockProvider;

export interface ClientSPAWindow extends Window {
  /** @deprecated Use "_qRouterHistoryPatch" instead. Will be removed in V3 */
  _qCityHistoryPatch?: boolean;
  /** @deprecated Use "_qRouterSPA" instead. Will be removed in V3 */
  _qCitySPA?: boolean;
  /** @deprecated Use "_qRouterScrollEnabled" instead. Will be removed in V3 */
  _qCityScrollEnabled?: boolean;
  /** @deprecated Use "_qRouterScrollDebounce" instead. Will be removed in V3 */
  _qCityScrollDebounce?: ReturnType<typeof setTimeout>;
  /** @deprecated Use "_qRouterInitPopstate" instead. Will be removed in V3 */
  _qCityInitPopstate?: () => void;
  /** @deprecated Use "_qRouterInitAnchors" instead. Will be removed in V3 */
  _qCityInitAnchors?: (event: MouseEvent) => void;
  /** @deprecated Use "_qRouterInitVisibility" instead. Will be removed in V3 */
  _qCityInitVisibility?: () => void;
  /** @deprecated Use "_qRouterInitScroll" instead. Will be removed in V3 */
  _qCityInitScroll?: () => void;
  _qRouterHistoryPatch?: boolean;
  _qRouterSPA?: boolean;
  _qRouterScrollEnabled?: boolean;
  _qRouterScrollDebounce?: ReturnType<typeof setTimeout>;
  _qRouterInitPopstate?: () => void;
  _qRouterInitAnchors?: (event: MouseEvent) => void;
  _qRouterInitVisibility?: () => void;
  _qRouterInitScroll?: () => void;
  _qcs?: boolean;
}

// See also spa-init.ts
function initializeSPA(goto: RouteNavigate, scroller: HTMLElement) {
  if (!window._qRouterSPA) {
    // only add event listener once
    window._qRouterSPA = true;
    history.scrollRestoration = 'manual';

    window.addEventListener('popstate', () => {
      // Disable scroll handler eagerly to prevent overwriting history.state.
      window._qRouterScrollEnabled = false;
      clearTimeout(window._qRouterScrollDebounce);

      goto(location.href, {
        type: 'popstate',
      });
    });

    window.removeEventListener('popstate', window._qRouterInitPopstate!);
    window._qRouterInitPopstate = undefined;

    // Browsers natively will remember scroll on ALL history entries, incl. custom pushState.
    // Devs could push their own states that we can't control.
    // If a user doesn't initiate scroll after, it will not have any scrollState.
    // We patch these to always include scrollState.
    // TODO Block this after Navigation API PR, browsers that support it have a Navigation API solution.
    if (!window._qRouterHistoryPatch) {
      window._qRouterHistoryPatch = true;
      const pushState = history.pushState;
      const replaceState = history.replaceState;

      const prepareState = (state: any) => {
        if (state === null || typeof state === 'undefined') {
          state = {};
        } else if (state?.constructor !== Object) {
          state = { _data: state };

          if (isDev) {
            console.warn(
              'In a Qwik SPA context, `history.state` is used to store scroll state. ' +
                'Direct calls to `pushState()` and `replaceState()` must supply an actual Object type. ' +
                'We need to be able to automatically attach the scroll state to your state object. ' +
                'A new state object has been created, your data has been moved to: `history.state._data`'
            );
          }
        }

        state._qRouterScroll = state._qRouterScroll || currentScrollState(scroller);
        return state;
      };

      history.pushState = (state, title, url) => {
        state = prepareState(state);
        return pushState.call(history, state, title, url);
      };

      history.replaceState = (state, title, url) => {
        state = prepareState(state);
        return replaceState.call(history, state, title, url);
      };
    }

    // Chromium and WebKit fire popstate+hashchange for all #anchor clicks,
    // ... even if the URL is already on the #hash.
    // Firefox only does it once and no more, but will still scroll. It also sets state to null.
    // Any <a> tags w/ #hash href will break SPA state in Firefox.
    // We patch these events and direct them to Link pipeline during SPA.
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = (event.target as HTMLElement).closest('a[href]');

      if (target && !target.hasAttribute('preventdefault:click')) {
        const href = target.getAttribute('href')!;
        const prev = new URL(location.href);
        const dest = new URL(href, prev);
        // Patch only same-page anchors.
        if (isSameOrigin(dest, prev) && isSamePath(dest, prev)) {
          event.preventDefault();

          // Simulate same-page (no hash) anchor reload.
          // history.scrollRestoration = 'manual' makes these not scroll.
          if (!dest.hash && !dest.href.endsWith('#')) {
            if (dest.href !== prev.href) {
              history.pushState(null, '', dest);
            }

            window._qRouterScrollEnabled = false;
            clearTimeout(window._qRouterScrollDebounce);
            saveScrollHistory({
              ...currentScrollState(scroller),
              x: 0,
              y: 0,
            });
            location.reload();
            return;
          }

          goto(target.getAttribute('href')!);
        }
      }
    });

    document.removeEventListener('click', window._qRouterInitAnchors!);
    window._qRouterInitAnchors = undefined;

    // TODO Remove block after Navigation API PR.
    // Calling `history.replaceState` during `visibilitychange` in Chromium will nuke BFCache.
    // Only Chromium 96 - 101 have BFCache without Navigation API. (<1% of users)
    if (!(window as any).navigation) {
      // Commit scrollState on refresh, cross-origin navigation, mobile view changes, etc.
      document.addEventListener(
        'visibilitychange',
        () => {
          if (
            (window._qRouterScrollEnabled || window._qCityScrollEnabled) &&
            document.visibilityState === 'hidden'
          ) {
            if (window._qCityScrollEnabled) {
              console.warn(
                '"_qCityScrollEnabled" is deprecated. Use "_qRouterScrollEnabled" instead.'
              );
            }
            // Last & most reliable point to commit state.
            // Do not clear timeout here in case debounce gets to run later.
            const scrollState = currentScrollState(scroller);
            saveScrollHistory(scrollState);
          }
        },
        { passive: true }
      );

      document.removeEventListener('visibilitychange', window._qRouterInitVisibility!);
      window._qRouterInitVisibility = undefined;
    }

    window.addEventListener(
      'scroll',
      () => {
        // TODO: remove "_qCityScrollEnabled" condition in v3
        if (!window._qRouterScrollEnabled && !window._qCityScrollEnabled) {
          return;
        }

        clearTimeout(window._qRouterScrollDebounce);
        window._qRouterScrollDebounce = setTimeout(() => {
          const scrollState = currentScrollState(scroller);
          saveScrollHistory(scrollState);
          // Needed for e2e debounceDetector.
          window._qRouterScrollDebounce = undefined;
        }, 200);
      },
      { passive: true }
    );

    removeEventListener('scroll', window._qRouterInitScroll!);
    window._qRouterInitScroll = undefined;

    // Cache SPA recovery script.
    spaInit.resolve();
  }
}
