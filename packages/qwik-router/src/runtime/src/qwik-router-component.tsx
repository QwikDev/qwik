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
import { ensureSlash } from '../../utils/pathname';
import {
  $,
  component$,
  createComputed$,
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
  useTask$,
  untrack,
  type QRL,
  type Signal,
} from '@qwik.dev/core';
import {
  _getContextContainer,
  _getDomContainer,
  _hasStoreEffects,
  _waitOn,
  _waitUntilRendered,
  forceStoreEffects,
  type _ComputedSignalInternal,
  type ComputedSignal,
  type ClientContainer,
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
  RouteActionRunnerContext,
  RouteLoaderCtxContext,
  RouteLocationContext,
  RouteNavigateContext,
  RouteStateContext,
} from './contexts';
import { createDocumentHead, resolveHead } from './head';
import { refreshLinkPrefetchObserver } from './link-prefetch';
import { getRouterConfig } from './router-config';
import { internalState, preventNav, REFRESH_HEAD, RUN_PENDING_ACTION } from './navigation-state';
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
  clearNavFetchCache,
  abortRouteLoaderNavigation,
  prepareRouteLoaders,
  commitRouteLoaders,
  restoreRouteLoaders,
  ensureRouteLoaderSignals,
  getClientRouteLoaders,
  isImmutableLoader,
  setLoaderSignalValue,
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
  HttpStatus,
  LoadedRoute,
  Loader,
  LoaderInternal,
  MutableRouteLocation,
  NavigationType,
  PageModule,
  ResolvedDocumentHead,
  RouteActionResolver,
  RouteActionValue,
  RouteLocation,
  RouteNavigate,
  RouteStateInternal,
  ScrollState,
} from './types';
import { submitAction } from './use-endpoint';
import { useQwikRouterEnv } from './use-functions';
import { isPromise, isSameOrigin, isSamePath, toPath, toUrl } from './utils';
import {
  shouldStartViewTransition,
  startViewTransition,
  type ViewTransition,
} from './view-transition';

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
   * Enable the ViewTransition API on SPA navigation. Opt-in: set to `true` to enable.
   *
   * Default: `false`
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

type Navigate = (
  path?: string | number | URL,
  options?: Parameters<RouteNavigate>[1]
) => Promise<void>;

type ActionData = NonNullable<Parameters<typeof resolveHead>[0]>;

type NavigationCommit = {
  routeName: string;
  navType: NavigationType;
  prevUrl: URL;
  replaceState: boolean | undefined;
  shouldForcePrevUrl: boolean;
  shouldForceUrl: boolean;
  shouldForceParams: boolean;
  navCount: number;
  contentModules: ContentModule[];
  actionData: ActionData | undefined;
};

const ensureRouteInternal = (
  routeInternal: Signal<RouteStateInternal | undefined>,
  routeLocation: RouteLocation
): RouteStateInternal =>
  (routeInternal.untrackedValue ||= { type: 'initial', dest: routeLocation.url });

const getRouterContainer = () => _getDomContainer(document.documentElement);

const getServerHttpStatus = (
  notFound: boolean | undefined,
  response: EndpointResponse
): HttpStatus | undefined => {
  if (notFound) {
    return { status: 404, message: 'Not Found' };
  }
  const message = response.statusMessage ?? 'OK';
  return response.status === 200 && message === 'OK'
    ? undefined
    : { status: response.status, message };
};

const whenReady = async <T,>(read: () => T): Promise<T> => {
  for (;;) {
    try {
      return untrack(read);
    } catch (error) {
      if (!isPromise(error)) {
        throw error;
      }
      await error.catch(() => {});
    }
  }
};

const assignDocumentHead = (
  documentHead: Editable<ResolvedDocumentHead>,
  head: ResolvedDocumentHead
) => {
  documentHead.links = head.links;
  documentHead.meta = head.meta;
  documentHead.styles = head.styles;
  documentHead.scripts = head.scripts;
  documentHead.title = head.title;
  documentHead.frontmatter = head.frontmatter;
};

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
  const locale = getLocale('');
  const viewTransition = props?.viewTransition;

  const url = new URL(urlEnv);
  const routeLocationTarget: MutableRouteLocation = {
    url,
    params: env.params,
    isNavigating: false,
    prevUrl: undefined,
  };
  const routeLocation = useStore<MutableRouteLocation>(routeLocationTarget, { deep: false });
  const navResolver: { r?: () => void; p?: Promise<void>; cancel?: () => void } = {};
  const routeLoaderCtx = env.routeLoaderCtx;
  routeLoaderCtx.manifestHash = manifestHash;
  Object.assign(routeLoaderCtx.loaderPaths, env.loadedRoute.$loaderPaths$);
  // Inject middleware values without fetching.
  const loaderState = {} as Record<string, ComputedSignal<unknown>>;
  const contentModulesForInit = env.loadedRoute.$mods$ as ContentModule[];
  const loaders = ensureRouteLoaderSignals(
    contentModulesForInit,
    loaderState,
    routeLoaderCtx,
    env.ev
  );
  for (const loader of loaders) {
    if (loader.__id in env.loaderValues) {
      const value = env.loaderValues[loader.__id];
      setLoaderSignalValue(loaderState[loader.__id], value);
    }
  }

  const routeInternal = useSignal<RouteStateInternal>();
  const documentHead = useStore<Editable<ResolvedDocumentHead>>(
    () => createDocumentHead(serverHead, manifestHash),
    { deep: false }
  );
  const pageModule = contentModulesForInit[contentModulesForInit.length - 1] as PageModule;
  const content = useStore<Editable<ContentState>>({
    headings: pageModule.headings,
    menu: env.loadedRoute.$menu$,
  });

  const contentInternal = useSignal<ContentStateInternal>(noSerialize(contentModulesForInit));

  const httpStatus = useSignal(getServerHttpStatus(env.loadedRoute.$notFound$, env.response));

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
  const serverActionData: ActionData | undefined =
    currentActionId || env.response.status !== 200
      ? { action: currentActionId, actionResult: currentAction, status: env.response.status }
      : undefined;
  const actionDataSignal = useSignal(serverActionData);

  _waitOn(
    whenReady(() => {
      for (const loader of loaders) {
        if (!isImmutableLoader(loader.__id)) {
          (loaderState[loader.__id] as _ComputedSignalInternal<unknown>).untrackedPending;
        }
      }
    })
      .then(() =>
        whenReady(() =>
          resolveHead(
            serverActionData,
            loaderState,
            routeLocation,
            contentModulesForInit,
            locale,
            serverHead
          )
        )
      )
      .then((head) => assignDocumentHead(documentHead, head))
  );

  /**
   * This is the `nav()` function that `useNavigation()` returns. It is also used internally for SPA
   * navigations and is provided in context for use in loaders and actions.
   *
   * Note: when goto is called, the address bar change must happen in the same tick for Safari to
   * treat it as a user-initiated navigation and allow scroll restoration to work. For this reason,
   * make sure to change the address bar before awaiting anything.
   */
  const goto: RouteNavigate = $((path, opt) => {
    const startNavigation: Navigate = async (path, opt) => {
      if ((path as unknown) === REFRESH_HEAD) {
        const contentModules = contentInternal.untrackedValue;
        if (contentModules) {
          updateHead(contentModules, actionDataSignal.untrackedValue, internalState.navCount);
        }
        return;
      }
      if ((path as unknown) === RUN_PENDING_ACTION) {
        return loadNavigation(
          ensureRouteInternal(routeInternal, routeLocation),
          actionState.value,
          getRouterContainer()
        );
      }
      const {
        type = 'link',
        forceReload = path === undefined, // Hack for nav() because this API is already set.
        replaceState = false,
        scroll = true,
      } = typeof opt === 'object' ? opt : { forceReload: opt };
      // If this is the first SPA navigation, we rewrite routeInternal's URL
      // as the browser location URL to prevent an erroneous origin mismatch.
      // The initial value of routeInternal is derived from the server env,
      // which in the case of SSG may not match the actual origin the site
      // is deployed on.
      // We only do this for link navigations, as popstate will have already changed the URL
      const current = ensureRouteInternal(routeInternal, routeLocation);
      if (isBrowser && type === 'link' && current.type === 'initial') {
        const url = new URL(window.location.href);
        current.dest = url;
        routeLocation.url = url;
      }

      const lastDest = current.dest;
      const dest =
        path === undefined
          ? lastDest
          : typeof path === 'number'
            ? path
            : toUrl(path, routeLocation.url);

      if (
        navResolver.p &&
        !forceReload &&
        typeof dest !== 'number' &&
        isSamePath(dest, lastDest) &&
        dest.href === lastDest.href
      ) {
        // Repeated redirects/loaders can request the same in-flight destination. Treat that as a
        // duplicate so we don't bump navCount and cancel the navigation that would commit it.
        return navResolver.p;
      }

      const attemptCount = ++internalState.attemptCount;

      if (
        preventNav.$cbs$ &&
        (forceReload ||
          typeof dest === 'number' ||
          !isSamePath(dest, lastDest) ||
          !isSameOrigin(dest, lastDest))
      ) {
        const prevents = await Promise.all([...preventNav.$cbs$.values()].map((cb) => cb(dest)));
        if (attemptCount !== internalState.attemptCount || prevents.some(Boolean)) {
          if (attemptCount === internalState.attemptCount && type === 'popstate') {
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
          ensureRouteInternal(routeInternal, routeLocation).dest = newUrl;
          routeLocation.url = newUrl;
          const contentModules = contentInternal.untrackedValue;
          if (contentModules) {
            updateHead(contentModules, actionDataSignal.untrackedValue, internalState.navCount);
          }
        }

        return navResolver.p;
      }

      const navCount = ++internalState.navCount;
      internalState.currentTransition?.skipTransition();
      navResolver.cancel?.();
      navResolver.cancel = undefined;
      navResolver.r?.();

      let historyUpdated = false;
      if (isBrowser) {
        getClientRouteLoaders(routeLoaderCtx, routeLocation.url.href);
      }
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

      const wasNavigating = routeLocation.isNavigating;
      routeLocation.isNavigating = true;
      const container = isBrowser ? _getContextContainer() : undefined;
      if (container && !wasNavigating) {
        // flush isNavigating to the DOM before awaiting the next task so that the router outlet can show a loading state
        await _waitUntilRendered(container);
        if (navCount !== internalState.navCount) {
          return;
        }
      }

      actionState.value = undefined;
      const navigation: RouteStateInternal = {
        type,
        dest,
        forceReload,
        replaceState,
        scroll,
        historyUpdated,
      };
      routeInternal.value = navigation;

      if (wasNavigating) {
        abortRouteLoaderNavigation(routeLoaderCtx);
      }
      if (isBrowser) {
        // Prefetch bundles; loader signals fetch navigation data below.
        prefetchRoute(dest, false, 0.8, manifestHash, true);
      }

      navResolver.p = new Promise<void>((resolve) => {
        navResolver.r = () => {
          navResolver.r = undefined;
          navResolver.p = undefined;
          resolve();
        };
      });
      const navigated = navResolver.p;
      loadNavigation(
        navigation,
        undefined,
        (container as ClientContainer | undefined) ?? getRouterContainer()
      );
      return navigated;
    };

    const loadNavigation = async (
      navigation: RouteStateInternal,
      action: RouteActionValue,
      container: ClientContainer
    ) => {
      action?.resolveDispatch?.();
      if (action) {
        action.resolveDispatch = undefined;
      }

      const prevUrl = routeLocation.url;
      const navType = action ? 'form' : navigation.type;
      const replaceState = navigation.replaceState;
      // Capture navCount at entry. If another goto() fires while we're awaiting
      // loadRoute or loaders, navCount will have been bumped and we should bail so
      // the newer navigation takes over.
      const navCountBefore = internalState.navCount;
      let actionData: ActionData | undefined;
      let actionLoaderHashes: string[] | undefined;
      let loadedRoute: LoadedRoute;
      const trackUrl = new URL(navigation.dest, location as any as URL);
      const canceled = new Promise<undefined>((resolve) => {
        navResolver.cancel = () => resolve(undefined);
      });

      // ensure correct trailing slash
      if (trackUrl.pathname.endsWith('/')) {
        if (globalThis.__NO_TRAILING_SLASH__) {
          trackUrl.pathname = trackUrl.pathname.slice(0, -1);
        }
      } else if (!globalThis.__NO_TRAILING_SLASH__) {
        trackUrl.pathname = ensureSlash(trackUrl.pathname);
      }
      const loadRoutePromise = getRouterConfig().then((config) => {
        if (internalState.navCount !== navCountBefore) {
          return;
        }
        return loadRoute(config.routes, config.cacheModules, trackUrl.pathname);
      });
      try {
        const route = await Promise.race([loadRoutePromise, canceled]);
        if (!route) {
          return;
        }
        loadedRoute = route;
      } catch (e) {
        if (internalState.navCount !== navCountBefore) {
          return;
        }
        const preparedNavCount = getClientRouteLoaders(routeLoaderCtx).navCount;
        if (preparedNavCount !== undefined) {
          restoreRouteLoaders(loaderState, routeLoaderCtx, preparedNavCount);
        }
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
        const result = await Promise.race([
          submitAction(action, trackUrl).then((result) => {
            // Superseded actions still complete their caller's submit promise.
            if (result && action.resolve) {
              action.resolve({ status: result.status, result: result.result });
              action.resolve = undefined;
            }
            return result;
          }),
          canceled,
        ]);

        if (internalState.navCount !== navCountBefore || action !== actionState.untrackedValue) {
          return;
        }
        navResolver.cancel = undefined;
        if (!result) {
          routeInternal.untrackedValue = { type: navType, dest: trackUrl };
          return;
        }

        if (result.redirect) {
          if (result.redirect instanceof URL) {
            location.href = result.redirect.href;
          } else {
            startNavigation(result.redirect, { replaceState: true });
          }
          return;
        }

        actionData = {
          status: result.status,
          action: action.id,
          actionResult: result.result,
        };

        actionLoaderHashes = result.loaderHashes;
      }
      navResolver.cancel = undefined;

      const { $routeName$, $params$, $mods$, $menu$, $notFound$ } = loadedRoute;
      const contentModules = $mods$ as ContentModule[];
      routeLoaderCtx.goto = noSerialize(startNavigation);
      const routeLoaders = prepareRouteLoaders(
        contentModules,
        loaderState,
        routeLoaderCtx,
        loadedRoute.$loaderPaths$,
        trackUrl,
        prevUrl,
        navCountBefore,
        action ? (actionLoaderHashes ?? null) : undefined,
        action ?? navigation
      );
      // Trigger loader signals to fetch data for the new route. No await —
      // we want to render ASAP. Loaders update the page when they resolve.
      // A loader that redirects fires goto() directly; the new nav starts while
      // this one finishes committing, producing a brief flash of the current page.
      // Immutable loaders stay lazy: they download only when actually read,
      // and are then browser-cached for the life of the deploy.
      await whenReady(() => {
        for (let i = 0; i < routeLoaders.length; i++) {
          const loader = routeLoaders[i];
          if (!isImmutableLoader(loader.__id)) {
            // trigger load
            (loaderState[loader.__id] as _ComputedSignalInternal<unknown>).untrackedPending;
          }
        }
      });
      // Clear after the kick-off above so hover-prefetched promises are consumed
      // by this nav's fetches; the next hover starts a fresh per-nav cache.
      clearNavFetchCache();
      if (internalState.navCount !== navCountBefore) {
        return;
      }

      // Update httpStatus for 404/error pages
      if ($notFound$) {
        httpStatus.value = { status: 404, message: 'Not Found' };
      } else if (actionData) {
        httpStatus.value = { status: actionData.status, message: 'OK' };
      } else {
        httpStatus.value = { status: 200, message: 'OK' };
      }
      const pageModule = contentModules[contentModules.length - 1] as PageModule;

      if (isSamePath(trackUrl, navigation.dest)) {
        trackUrl.hash = navigation.dest.hash;
      }

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

      const nextRouteInternal: RouteStateInternal = {
        type: navType,
        dest: trackUrl,
      };
      if (navigation.forceReload !== undefined) {
        nextRouteInternal.forceReload = navigation.forceReload;
      }
      if (navigation.replaceState !== undefined) {
        nextRouteInternal.replaceState = navigation.replaceState;
      }
      if (navigation.scroll !== undefined) {
        nextRouteInternal.scroll = navigation.scroll;
      }
      if (navigation.historyUpdated !== undefined) {
        nextRouteInternal.historyUpdated = navigation.historyUpdated;
      }
      routeInternal.untrackedValue = nextRouteInternal;

      // Update content.
      // IMPORTANT: contentInternal must use .untrackedValue, NOT .value. RouterOutlet
      // is fired later by contentInternal.trigger() inside navigate(), which runs
      // inside the view-transition's update callback. Using .value here would fire it
      // before startViewTransition captures the old DOM, breaking view transitions
      // (the update callback never gets invoked).
      content.headings = pageModule.headings;
      content.menu = $menu$;
      contentInternal.untrackedValue = noSerialize(contentModules);
      actionDataSignal.untrackedValue = actionData;

      commitNavigation(
        {
          routeName: $routeName$,
          navType,
          prevUrl,
          replaceState,
          shouldForcePrevUrl,
          shouldForceUrl,
          shouldForceParams,
          navCount: navCountBefore,
          contentModules,
          actionData,
        },
        nextRouteInternal,
        container
      );
    };

    const updateHead = (
      contentModules: ContentModule[],
      actionData: ActionData | undefined,
      navCount: number
    ): Promise<void> | void => {
      let head: ResolvedDocumentHead;
      try {
        head = resolveHead(
          actionData,
          loaderState,
          routeLocation,
          contentModules,
          locale,
          serverHead
        );
      } catch (error) {
        if (isPromise(error)) {
          const retry = () => {
            if (navCount === internalState.navCount) {
              return updateHead(contentModules, actionData, navCount);
            }
          };
          return error.then(retry, retry);
        }
        // Preserve the current head after client-side calculation errors.
        console.error(error);
        return;
      }
      assignDocumentHead(documentHead, head);
    };

    const commitNavigation = (
      nav: NavigationCommit,
      navigation: RouteStateInternal,
      container: ClientContainer
    ) => {
      if (nav.navCount !== internalState.navCount) {
        return;
      }
      const { navType, prevUrl, replaceState, routeName } = nav;
      const trackUrl = routeLocation.url;

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

      initializeSPA(startNavigation, scroller);

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

      let didNavigate = false;
      let navigatePromise: Promise<void> | undefined;
      let currentTransition: ViewTransition | undefined;
      const navigate = () => {
        if (navigatePromise) {
          return navigatePromise;
        }
        if (nav.navCount !== internalState.navCount) {
          return Promise.resolve();
        }
        didNavigate = true;
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
        const headUpdated = updateHead(nav.contentModules, nav.actionData, nav.navCount);
        contentInternal.trigger();
        return (navigatePromise = Promise.all([_waitUntilRendered(container), headUpdated]).then(
          () => {
            if (nav.navCount === internalState.navCount) {
              commitRouteLoaders(loaderState, routeLoaderCtx, nav.navCount);
            }
          },
          (error) => {
            if (nav.navCount === internalState.navCount) {
              restoreRouteLoaders(loaderState, routeLoaderCtx, nav.navCount);
            }
            throw error;
          }
        ));
      };

      const _waitNextPage = () => {
        if (!shouldStartViewTransition(viewTransition)) {
          return navigate().then(() => undefined as ViewTransition | undefined);
        }
        const { ready, transition } = startViewTransition({
          update: navigate,
          types: ['qwik-navigation'],
        });
        currentTransition = transition;
        internalState.currentTransition = transition;
        return ready.then(
          () => transition,
          (reason) => {
            if (!didNavigate && nav.navCount === internalState.navCount) {
              return navigate().then(() => transition);
            }
            if ((reason as Error)?.name === 'AbortError') {
              return transition;
            }
            throw reason;
          }
        );
      };
      _waitNextPage().finally(() => {
        if (currentTransition && internalState.currentTransition === currentTransition) {
          internalState.currentTransition = undefined;
        }
        if (nav.navCount !== internalState.navCount) {
          return;
        }
        container.element.setAttribute?.(Q_ROUTE, routeName);
        const scrollState = currentScrollState(scroller);
        saveScrollHistory(scrollState);
        window._qRouterScrollEnabled = true;
        callRestoreScrollOnDocument();

        refreshLinkPrefetchObserver(manifestHash);
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
    };

    return startNavigation(path, opt);
  });

  routeLoaderCtx.onValue = goto;

  useContextProvider(ContentContext, content);
  useContextProvider(ContentInternalContext, contentInternal);
  useContextProvider(DocumentHeadContext, documentHead);
  useContextProvider(HttpStatusContext, httpStatus);
  useContextProvider(RouteLocationContext, routeLocation);
  useContextProvider(RouteNavigateContext, goto);
  useContextProvider(RouteActionRunnerContext, goto);
  useContextProvider(RouteStateContext, loaderState);
  useContextProvider(RouteLoaderCtxContext, routeLoaderCtx);
  useContextProvider(RouteActionContext, actionState);
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
  const loadersState = useStore<Record<string, ComputedSignal<unknown>>>({}, { deep: false });
  for (const [loaderId, data] of Object.entries(loadersData ?? {})) {
    loadersState[loaderId] ||= createComputed$(() => data);
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
    action?.resolveDispatch?.();
    if (action) {
      action.resolveDispatch = undefined;
    }
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
  /** @internal */
  _qRouterHistoryPatch?: boolean;
  /** @internal */
  _qRouterSPA?: boolean;
  /** @internal */
  _qRouterScrollEnabled?: boolean;
  /** @internal */
  _qRouterScrollDebounce?: ReturnType<typeof setTimeout>;
  /** @internal */
  _qRouterInitPopstate?: () => void;
  /** @internal */
  _qRouterInitAnchors?: (event: MouseEvent) => void;
  /** @internal */
  _qRouterInitVisibility?: () => void;
  /** @internal */
  _qRouterInitScroll?: () => void;
  /** @internal */
  _qcs?: boolean;
  /** @internal The path this document was rendered for. */
  _qcp?: string;
}

// See also spa-init.ts
function initializeSPA(goto: Navigate, scroller: HTMLElement) {
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
          if (window._qRouterScrollEnabled && document.visibilityState === 'hidden') {
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
        if (!window._qRouterScrollEnabled) {
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
