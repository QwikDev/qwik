# Qwik Router Architecture

This document describes how a request flows through Qwik Router, from initial server
hit through SSR, and then how SPA navigation and RPC work on the client.

## 1. Request Entry — Middleware Chain

Every request enters through a platform adapter (Cloudflare, Node, Deno, etc.) which
calls `requestHandler(serverRequestEv, opts)`.

### Route Resolution

1. The build-time generated `@qwik-router-config` provides the route trie, server
   plugins, caching options, and base pathname.
2. `loadRoute(routes, cacheModules, pathname)` walks the trie to find the matching
   route. Trie nodes encode layouts (`_L`), pages (`_I`), params (`_W`/`_A`),
   loader hashes (`_R`), menus (`_N`), and error/404 modules (`_E`/`_4`).
3. `resolveRequestHandlers(...)` builds the ordered handler chain.

### The Handler Chain (in order)

| Handler                 | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| jsonRequestWrapper      | wraps redirects/errors as JSON for loader/action fetches  |
| serverErrorMiddleware   | catches ServerError, swaps to error module, re-renders    |
| csrfCheck               | POST/PUT/PATCH/DELETE origin check                        |
| serverPlugins.onRequest | global plugin middleware                                  |
| routeModules.onRequest  | per-route middleware (layouts + page)                     |
| loaderHandler           | serves individual loader JSON (q-loader-\*.json requests) |
| actionHandler           | processes ?qaction= JSON requests                         |
| runServerFunction       | handles ?qfunc= RPC calls (server$)                       |
| fixTrailingSlash        | enforces trailing slash policy                            |
| actionsMiddleware       | runs action for form POST (progressive enhancement)       |
| loadersMiddleware       | runs ALL loaders in parallel via Promise.all              |
| eTagMiddleware          | checks/sets ETag, returns 304 if matched                  |
| renderQwikMiddleware    | the SSR renderer                                          |

### Request Recognition

The request handler recognizes special URL patterns:

- `q-loader-{id}.{hash}.json` → individual loader data fetch (strips suffix from URL
  so middleware sees the clean route path)
- `?qaction={id}` → action invocation
- `?qfunc=` → server$ RPC call

### RequestEvent

Each request gets a `RequestEventInternal` that provides `url`, `params`, `headers`,
`cookie`, `sharedMap`, and methods like `next()`, `redirect()`, `error()`, `json()`,
`send()`. The `sharedMap` serves as a per-request blackboard for passing data between
middleware, loaders, actions, and the renderer.

Key sharedMap entries:

- `@routeLoaderValues` — pre-computed loader return values
- `@routeLoaderState` — reactive AsyncSignal instances
- `@loaderPathsStore` — RouteLoaderCtx store
- `@actionResult` — action return value (for progressive enhancement)

On Node-like runtimes, `AsyncLocalStorage` wraps request execution so
`getRequestEvent()` works from any async context without threading.

## 2. Loaders — `routeLoader$`

### Server Execution

During SSR, `loadersMiddleware` runs **all** loaders for the matched route in parallel
via `Promise.all`. Each loader QRL is called with the `RequestEvent`. Results are
stored in `sharedMap['@routeLoaderValues']`.

### Client Fetch

On the client, each loader becomes an **AsyncSignal** — a reactive primitive that
lazily computes its value. The compute function for a loader signal:

1. Reads its request (route path and page URL) for the current navigation, untracked,
   from client-only state that `prepareRouteLoaders` sets. Navigation re-runs it with
   `invalidate()`.
2. If a pre-loaded value was injected (via `setLoaderSignalValue`), returns it.
3. If `routePath` is undefined (loader not on current route), returns the previous
   value (stale-by-default contract).
4. Otherwise, fetches `{basePath}{routePath}/q-loader-{id}.{manifestHash}.json`.

### Route Loader Context

`RouteLoaderCtx` is a reactive store shared across the app:

```ts
{
  loaderPaths: Record<string, string | undefined>,  // loader ID → route path
  goto?: RouteNavigate,  // for loader-initiated redirects (client-only)
  manifestHash?: string,  // for q-loader fetch URLs
}
```

On SPA navigation, `prepareRouteLoaders()` records the new route's loader paths,
invalidates the loaders it refetches, and aborts the ones the new route does not use.
Once the new page has rendered, `commitRouteLoaders()` disposes those unused loader
signals and drops them from `loaderState` and `loaderPaths`, so a later visit starts
with a fresh signal. If the navigation fails, `restoreRouteLoaders()` returns to the
last committed state.

### `ensureRouteLoaderSignals`

Scans route modules for loader exports, creates AsyncSignals for any not yet in
`loaderState`, returns the list. Called both at SSR init and on each SPA navigation.

### `setLoaderSignalValue`

Injects a pre-computed value into an AsyncSignal without fetching. `useQwikRouter`
uses it during SSR to seed loader signals with the values the middleware computed.

## 3. SSR — Server-Side Rendering

### `useQwikRouter` — The Root Hook

Called once at the root component during SSR. Sets up all reactive state:

1. Reads `env = useQwikRouterEnv()` — the `QwikRouterEnvData` from server data,
   containing `loadedRoute`, `loaderValues`, `response`, `params`, `routeLoaderCtx`.
2. Creates stores: `routeLocation`, `loaderState`, `documentHead`, `content`,
   `contentInternal`, `actionState`, `actionDataSignal`, `httpStatus`, `navContext`.
3. Calls `ensureRouteLoaderSignals` to create AsyncSignals, then
   `setLoaderSignalValue` for each pre-computed loader value.
4. Provides all contexts (`RouteStateContext`, `RouteLocationContext`,
   `DocumentHeadContext`, etc.).

### Task Structure

`useQwikRouter` registers three `useTask$` hooks:

#### Nav Task — Route Loading & State Setup

```ts
useTask$(async ({ track }) => { ... }, { deferUpdates: isServer })
```

Tracks `routeInternal` (destination signal) and `actionState`.

**Server path:**

- Uses `env.loadedRoute` and `env.response` directly (no fetch needed).
- Populates `routeLocation`, `contentInternal`, `httpStatus`.
- Leaves head resolution to the head task, which runs after this one on the server.

**Client path:**

- Calls `loadRoute(...)` to load route modules for the new URL.
- If an action is pending, calls `submitAction(...)` and processes the result.
- Calls `prepareRouteLoaders`, which runs `ensureRouteLoaderSignals`, invalidates the
  loaders to refetch, and aborts the ones the new route does not use.
- **Triggers** loader signals without awaiting: `loaderState[id].untrackedPending`.
  This starts the fetch but doesn't block navigation.
- Updates `routeLocation`, `contentInternal.untrackedValue`, `actionDataSignal`.
- Sets `navContext.value` — a `noSerialize`'d object with navigation metadata:
  `{ routeName, navType, prevUrl, replaceState, shouldForce*, navCount }`.

> **Why `contentInternal.untrackedValue`?** Subscribers (RouterOutlet, head
> task) must be fired later by `contentInternal.trigger()` inside the view
> transition's update callback. Using `.value` would fire subscribers before
> `startViewTransition` captures the old DOM, breaking view transitions.

#### Head Task — Head Resolution

```ts
useTask$(({ track }) => { ... }, { deferUpdates: isServer })
```

Tracks `contentInternal`, `actionDataSignal`, and whatever `resolveHead` reads, such
as loader signals. Runs on the server and the client.

1. **Head resolution** via `track(() => resolveHead(...))`. A loader signal with no
   value yet throws a promise, and the task re-runs once it resolves. On the client,
   other errors are logged and the current head stays.
2. Writes resolved head to `documentHead` store.

#### Navigation Task — Navigation Commit

```ts
useTask$(({ track }) => { ... }, { deferUpdates: false })
```

Tracks `navContext`. Client-only.

1. **Scroll setup:** finds scroller element, sets up `__q_scroll_restore__` callback.
2. **SPA init:** calls `initializeSPA(goto, scrollEl)` (one-time setup).
3. **View transition (opt-in):** when `viewTransition` is enabled, calls
   `startViewTransition({ update: navigate, types })`; otherwise `navigate()` runs
   directly. Inside the update callback: `clientNavigate(...)` pushes/replaces history
   unless `goto` already did, `contentInternal.trigger()` fires subscribers (rendering
   new content and re-running the head task), `_waitUntilRendered(container)` waits
   for the render cycle, then `commitRouteLoaders` drops the loaders the new route
   does not use.
4. **Post-transition:** sets `q:route` attribute, saves scroll state, enables
   scroll tracking, forces any deferred store effects, sets `isNavigating = false`,
   resolves `navResolver`.

### Head Resolution — `resolveHead`

Iterates content modules (layouts → page), collecting `routeConfig` / `head` exports.
Object configs are merged immediately; function configs are collected and called in
inner-before-outer order. Each function receives a `ResolveSyncValue` that reads
loader signals and action data. Reading an AsyncSignal with no value yet throws a
promise, and the head task re-runs once it resolves.

### Server Data Assembly

`getQwikRouterServerData(requestEv)` assembles the payload passed to Qwik's
`render()`:

```ts
{
  url, requestHeaders, locale, nonce,
  containerAttributes: { 'q:route': routeName },
  qwikrouter: {
    routeName, ev, params, loadedRoute,
    routeLoaderCtx, loaderValues,
    response: { status, statusMessage, action, actionResult, formData }
  }
}
```

## 4. Actions — `routeAction$`

### Defining an Action

`routeActionQrl(actionQrl, ...validators)` creates an `ActionInternal` with a stable
`__id` hash. When used in a component, it returns an `ActionStore` with a `.submit()`
method.

### Client-Side Action Flow

1. `action.submit(input)` sets `currentAction.value = { data, id, resolve }`.
2. This triggers the nav task (which tracks `actionState`).
3. Nav task calls `submitAction(action, pathname)`:
   - POST to `{pathname}/?qaction={id}` with `Accept: application/json`.
   - Body is FormData or JSON.
4. Response body: `{ result, loaderHashes? }`.
5. If hashes are present: `signal.invalidate(true)` for those loaders.
6. If hashes are absent: invalidate all current route loaders.
7. Resolves the `action.submit()` promise with `result`, which updates `actionDataSignal` and triggers any
   subscribers.

### Server-Side Action Execution

**JSON path** (`actionHandler`): For `Accept: application/json` requests:

1. Find action by ID, parse body, run validators, call QRL.
2. If `action.__invalidate` is set: return specific hashes in `h` for client refetch.
3. Otherwise, return no loader values. The client invalidates all current route loaders unless
   `__STRICT_LOADERS__` is enabled, in which case the response includes an empty hash list.

**Progressive enhancement** (`actionsMiddleware`): For form POST without JS:

1. Run the action, store result in `sharedMap['@actionResult']`.
2. Proceed to loaders + SSR render. The page renders with the action result available.

### `globalAction$`

Registers in `globalThis._qwikActionsMap` so the action can be resolved without being
exported from a route module. Useful for shared actions across routes.

## 5. SPA Navigation

### Early SPA Setup — `spa-init.ts`

A QRL event handler that qwikloader runs on page load (`qcinit`), before any router
task runs on the client. Sets up:

- `popstate` listener → resolves `RouteNavigateContext` from the DOM container and
  calls `nav(location.href, { type: 'popstate' })`.
- History patching → `pushState`/`replaceState` always embed `_qRouterScroll` state.
- Click handler → intercepts same-page anchor links.
- Scroll debounce → saves scroll position to history state every 200ms.
- Visibility change → commits scroll state on tab hide (for BFCache).

Once `window._qRouterSPA` is set (by `initializeSPA` in the navigation task), these
early handlers are removed and replaced by the full router handlers.

### `goto` — The Navigate Function

`goto(path, opt)` is provided as `RouteNavigateContext`:

1. **Prevent check:** If `usePreventNavigate$` callbacks are registered, await them.
   If any returns true, abort.
2. **Number:** `history.go(n)`.
3. **Cross-origin:** `location.href = dest.href`.
4. **Same path (no force):** Update URL in history, restore scroll, update
   `routeLocation.url`.
5. **Different path:** Save scroll, push history, set `routeInternal.value` (triggers
   nav task), prefetch route bundles. Returns a Promise resolved after commit.

### View Transitions

`startViewTransition({ types, update })` wraps the View Transition API:

- Tries typed API first (Chrome 125+), falls back to untyped (Chrome 111+).
- Dispatches `qviewtransition` custom event for external listeners.
- Returns `transition.ready` promise.
- If no View Transition API: calls `update()` directly.

### Navigation Timeline

```
goto(url)
  │
  ├─ Save scroll state
  ├─ Push history (clientNavigate)
  ├─ Set routeInternal.value ──────► Nav Task
  └─ Return promise                    │
                                       ├─ loadRoute(url)
                                       ├─ submitAction (if action pending)
                                       ├─ prepareRouteLoaders
                                       │    ├─ ensureRouteLoaderSignals
                                       │    ├─ invalidate() loaders to refetch
                                       │    └─ abort() loaders not on the new route
                                       ├─ Trigger loader signals (no await!)
                                       ├─ Update routeLocation, content, httpStatus
                                       └─ Set navContext.value ──────► Navigation Task
                                                                          │
                                         ┌────────────────────────────────┘
                                         │
                                         ├─ Setup scroll restore
                                         ├─ initializeSPA (one-time)
                                         ├─ startViewTransition
                                         │    └─ update callback:
                                         │         ├─ clientNavigate (unless goto already did)
                                         │         ├─ contentInternal.trigger() ──────► Head Task
                                         │         ├─ _waitUntilRendered()
                                         │         └─ commitRouteLoaders
                                         └─ finally:
                                              ├─ Set q:route attribute
                                              ├─ Save scroll, enable scroll tracking
                                              ├─ Force deferred store effects
                                              ├─ routeLocation.isNavigating = false
                                              └─ Resolve goto() promise

Head Task (also re-runs when action data or a loader signal it reads changes)
  ├─ track(() => resolveHead(...))
  │    └─ If loader throws promise → retry when resolved
  └─ Update documentHead
```

### Stale-by-Default Contract

The router starts loader fetches during navigation but does **not await** them.
`prepareRouteLoaders` refetches a loader by calling `invalidate()` on its signal, which
keeps the previous value, so components see previous loader values until new data
arrives. A loader with no value yet, such as one the previous route did not use, throws
its computation promise when read: the component that reads it waits for the data, and
the navigation waits in `_waitUntilRendered()` until that render finishes. The router
never calls `ComputedSignal.clear()`, and the public `LoaderSignal` type does not expose
it, so there is no public way to show a loading state instead of a loader's stale value
during navigation.

## 6. Context IDs

All provided by `useQwikRouter` at the root:

| ID      | Name                          | Type                                   |
| ------- | ----------------------------- | -------------------------------------- |
| `qr-s`  | `RouteStateContext`           | `Record<string, AsyncSignal<unknown>>` |
| `qr-lc` | `RouteLoaderCtxContext`       | `RouteLoaderCtx` store                 |
| `qr-l`  | `RouteLocationContext`        | `RouteLocation` store                  |
| `qr-n`  | `RouteNavigateContext`        | `goto` function                        |
| `qr-a`  | `RouteActionContext`          | `Signal<RouteActionValue>`             |
| `qr-h`  | `DocumentHeadContext`         | `ResolvedDocumentHead` store           |
| `qr-c`  | `ContentContext`              | `ContentState` (headings, menu)        |
| `qr-ic` | `ContentInternalContext`      | `Signal<ContentStateInternal>`         |
| `qr-hs` | `HttpStatusContext`           | `Signal<HttpStatus>`                   |
| `qr-p`  | `RoutePreventNavigateContext` | `registerPreventNav` function          |
