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

1. Reactively tracks `routeLoaderCtx.loaderPaths[id]` and `routeLoaderCtx.pageUrl`.
2. If a pre-loaded value was injected (via `setLoaderSignalValue`), returns it.
3. If `routePath` is undefined (loader not on current route), returns the previous
   value (stale-by-default contract).
4. Otherwise, fetches `{basePath}{routePath}/q-loader-{id}.{manifestHash}.json`.

### Route Loader Context

`RouteLoaderCtx` is a reactive store shared across the app:

```ts
{
  loaderPaths: Record<string, string | undefined>,  // loader ID → route path
  pageUrl: URL,
  manifestHash: string,
  basePath: string,
  goto?: RouteNavigate,  // for loader-initiated redirects
}
```

On SPA navigation, `updateRouteLoaderPaths()` **adds/updates** entries for loaders on
the new route but **does not clear** old entries. Stale loader signals keep their
previous value until their route is visited again.

### `ensureRouteLoaderSignals`

Scans route modules for loader exports, creates AsyncSignals for any not yet in
`loaderState`, returns the list. Called both at SSR init and on each SPA navigation.

### `setLoaderSignalValue`

Injects a pre-computed value into an AsyncSignal without triggering re-computation.
Used during SSR hydration and when actions return updated loader data.

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

`useQwikRouter` registers two `useTask$` hooks:

#### Nav Task — Route Loading & State Setup

```ts
useTask$(async ({ track }) => { ... }, { deferUpdates: isServer })
```

Tracks `routeInternal` (destination signal) and `actionState`.

**Server path:**

- Uses `env.loadedRoute` and `env.response` directly (no fetch needed).
- Populates `routeLocation`, `contentInternal`, `httpStatus`.
- Resolves head inline via `resolveHead(...)` and writes to `documentHead`.

**Client path:**

- Calls `loadRoute(...)` to load route modules for the new URL.
- If an action is pending, calls `submitAction(...)` and processes the result.
- Calls `updateRouteLoaderPaths` + `ensureRouteLoaderSignals`.
- **Triggers** loader signals without awaiting: `loaderState[id].untrackedLoading`.
  This starts the fetch but doesn't block navigation.
- Updates `routeLocation`, `contentInternal.untrackedValue`, `actionDataSignal`.
- Sets `navContext.value` — a `noSerialize`'d object with navigation metadata:
  `{ routeName, navigation, navType, replaceState, shouldForce* }`.

> **Why `contentInternal.untrackedValue`?** Subscribers (RouterOutlet, head+commit
> task) must be fired later by `contentInternal.trigger()` inside the view
> transition's update callback. Using `.value` would fire subscribers before
> `startViewTransition` captures the old DOM, breaking view transitions.

#### Head + Commit Task — Head Resolution & Navigation Commit

```ts
useTask$(({ track }) => { ... }, { deferUpdates: false })
```

Tracks `contentInternal`, `navContext`, and `actionDataSignal`. Client-only
(returns early on server since head is resolved inline in the nav task).

1. **Head resolution** via `track(() => resolveHead(...))`. The `track()` wrapper
   intercepts thrown promises from async loader signals (whose values haven't
   arrived yet) and automatically retries when they resolve.
2. Writes resolved head to `documentHead` store.
3. **Guard:** if `navContext` hasn't changed since the last commit (same object
   reference), this is a head-only update triggered by a loader resolving — skip
   the navigation commit below.
4. **Scroll setup:** finds scroller element, sets up `__q_scroll_restore__` callback.
5. **SPA init:** calls `initializeSPA(goto, scrollEl)` (one-time setup).
6. **View transition:** calls `startViewTransition({ update: navigate, types })`.
   Inside the update callback: `clientNavigate(...)` pushes/replaces history,
   `contentInternal.trigger()` fires subscribers (rendering new content),
   `_waitUntilRendered(container)` waits for the render cycle.
7. **Post-transition:** sets `q:route` attribute, saves scroll state, enables
   scroll tracking, forces any deferred store effects, resolves `navResolver`.

### Head Resolution — `resolveHead`

Iterates content modules (layouts → page), collecting `routeConfig` / `head` exports.
Object configs are merged immediately; function configs are collected and called in
inner-before-outer order. Each function receives a `ResolveSyncValue` that reads
loader signals and action data. On the client, reading an unresolved AsyncSignal
throws a promise, which `track()` in the commit task handles automatically.

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
4. Response envelope: `{ d?, e?, r?, s?, h?, l? }` (data, error, redirect, status,
   hashes-to-invalidate, loader-values).
5. If redirect (`r`): navigate via `goto`.
6. If loader values (`l`): `setLoaderSignalValue(signal, value)` for each.
7. If hashes (`h`): `signal.invalidate(true)` to trigger refetch.
8. Resolves the `action.submit()` promise with `{ status, data, error }`.

### Server-Side Action Execution

**JSON path** (`actionHandler`): For `Accept: application/json` requests:

1. Find action by ID, parse body, run validators, call QRL.
2. If `action.__invalidate` is set: return specific hashes in `h` for client refetch.
3. Otherwise (and not `__STRICT_LOADERS__`): re-run ALL loaders, return values in `l`.

**Progressive enhancement** (`actionsMiddleware`): For form POST without JS:

1. Run the action, store result in `sharedMap['@actionResult']`.
2. Proceed to loaders + SSR render. The page renders with the action result available.

### `globalAction$`

Registers in `globalThis._qwikActionsMap` so the action can be resolved without being
exported from a route module. Useful for shared actions across routes.

## 5. SPA Navigation

### Pre-Framework Boot — `spa-init.ts`

A QRL event handler that runs before the framework hydrates. Sets up:

- `popstate` listener → resolves `RouteNavigateContext` from the DOM container and
  calls `nav(location.href, { type: 'popstate' })`.
- History patching → `pushState`/`replaceState` always embed `_qRouterScroll` state.
- Click handler → intercepts same-page anchor links.
- Scroll debounce → saves scroll position to history state every 200ms.
- Visibility change → commits scroll state on tab hide (for BFCache).

Once `window._qRouterSPA` is set (by `initializeSPA` in the commit task), these
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
                                       ├─ updateRouteLoaderPaths
                                       ├─ ensureRouteLoaderSignals
                                       ├─ Trigger loader signals (no await!)
                                       ├─ Update routeLocation, content, httpStatus
                                       └─ Set navContext.value ──────► Head+Commit Task
                                                                          │
                                         ┌────────────────────────────────┘
                                         │
                                         ├─ track(() => resolveHead(...))
                                         │    └─ If loader throws promise → retry when resolved
                                         ├─ Update documentHead
                                         ├─ (if navContext unchanged → stop, head-only update)
                                         ├─ Setup scroll restore
                                         ├─ initializeSPA (one-time)
                                         ├─ startViewTransition
                                         │    └─ update callback:
                                         │         ├─ clientNavigate (history)
                                         │         ├─ contentInternal.trigger()
                                         │         └─ _waitUntilRendered()
                                         └─ finally:
                                              ├─ Set q:route attribute
                                              ├─ Save scroll, enable scroll tracking
                                              ├─ Force deferred store effects
                                              ├─ routeLocation.isNavigating = false
                                              └─ Resolve goto() promise
```

### Stale-by-Default Contract

Loader signals are **not awaited** before navigation commits. Components see previous
loader values until new data arrives. If a developer wants navigation to wait for a
loader, they set `allowStale: false` on the loader, which causes the AsyncSignal to
throw a promise (suspense-style) when read before data is available, blocking the
subtree render until the data arrives.

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
