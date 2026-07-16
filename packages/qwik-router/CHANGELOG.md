# @qwik.dev/city

## 2.0.0-beta.38

### Major Changes

- BREAKING: 404.tsx and error.tsx now render inside their layouts (with `@layout`/`!` modifiers), a route miss resolves the nearest 404.tsx, and the 404 page is prerendered for static hosts. Rename `404.tsx` to `404!.tsx` if you do not want to add the layout. (by [@briancarbone](https://github.com/briancarbone) in [#8762](https://github.com/QwikDev/qwik/pull/8762))

- BREAKING: SPA view transitions are now opt-in; set `viewTransition={true}` on `QwikRouterProvider` to re-enable them. (by [@maiieul](https://github.com/maiieul) in [#8778](https://github.com/QwikDev/qwik/pull/8778))

- ✨ relocate built assets with output.assetFileNames; remove build.assetsDir handling (by [@maiieul](https://github.com/maiieul) in [#8817](https://github.com/QwikDev/qwik/pull/8817))

- ✨ rename the `Link` `prefetchBundle` prop to `prefetchBundles` (by [@maiieul](https://github.com/maiieul) in [#8828](https://github.com/QwikDev/qwik/pull/8828))

### Minor Changes

- feat(router): automatically omit fully-prerendered, server-free routes from the production SSR route plan so their chunks tree-shake out of size-capped server bundles. (by [@briancarbone](https://github.com/briancarbone) in [#8742](https://github.com/QwikDev/qwik/pull/8742))

- ✨ route loaders gain a `blockSSR` option (default `true`); set `blockSSR: false` to run a loader in the background without blocking SSR (experimental, requires the `blockSSR` feature flag) (by [@wmertens](https://github.com/wmertens) in [#8793](https://github.com/QwikDev/qwik/pull/8793))

- ✨ returning `ev.redirect()`, `ev.error()` or `ev.rewrite()` from a loader, action, request handler or server function now behaves the same as throwing them (by [@wmertens](https://github.com/wmertens) in [#8775](https://github.com/QwikDev/qwik/pull/8775))

- feat(router): add an `exclude` option to `rewriteRoutes` to skip generating localized routes for matching path patterns. (by [@briancarbone](https://github.com/briancarbone) in [#8751](https://github.com/QwikDev/qwik/pull/8751))

- ✨ render SSG in a dedicated Vite build environment, so prerendered route code stays out of the deployed server bundle (by [@briancarbone](https://github.com/briancarbone) in [#8760](https://github.com/QwikDev/qwik/pull/8760))

  SSG now runs from the `buildApp` step of the Vite builder. The Qwik CLI and adapters already build via `createBuilder().buildApp()`, so they need no change. Code that prerenders by calling Vite's programmatic `build()` directly must switch to `builder.buildApp()`, otherwise the SSG step is silently skipped.

- ✨ add configurable server request body limits (by [@Varixo](https://github.com/Varixo) in [#8839](https://github.com/QwikDev/qwik/pull/8839))

### Patch Changes

- 🐞🩹 render navigation state before loading the next route (by [@Varixo](https://github.com/Varixo) in [#8821](https://github.com/QwikDev/qwik/pull/8821))

- 🐞🩹 prerendered routes are now correctly excluded from the server route plan (by [@briancarbone](https://github.com/briancarbone) in [#8759](https://github.com/QwikDev/qwik/pull/8759))

- fix(router): honor the `routeLoader$` `id` option so loaders created through a shared wrapper (which share one optimizer-assigned QRL hash) get distinct ids instead of all but the first being silently deduped in `getModuleRouteLoaders`. A dev-mode warning is now logged when two distinct loaders share an id. (by [@maiieul](https://github.com/maiieul) in [#8749](https://github.com/QwikDev/qwik/pull/8749))

- 🐞🩹 prevent cold dev route loader requests from failing during SPA navigation (by [@Varixo](https://github.com/Varixo) in [#8787](https://github.com/QwikDev/qwik/pull/8787))

- 🐞🩹 keep expiring loader responses private by default (by [@Varixo](https://github.com/Varixo) in [#8839](https://github.com/QwikDev/qwik/pull/8839))

- 🐞🩹 action redirects work again (by [@wmertens](https://github.com/wmertens) in [#8780](https://github.com/QwikDev/qwik/pull/8780))

- 🐞🩹 resolve image jsx imports with extra query parameters. (by [@Varixo](https://github.com/Varixo) in [#8753](https://github.com/QwikDev/qwik/pull/8753))

- 🐞🩹 avoid prefetching loader data already fetched by route loaders (by [@wmertens](https://github.com/wmertens) in [#8836](https://github.com/QwikDev/qwik/pull/8836))

- 🐞🩹 keep Azure response collection work proportional to output size (by [@Varixo](https://github.com/Varixo) in [#8839](https://github.com/QwikDev/qwik/pull/8839))

- 🐞🩹 keep deeply nested form parsing work proportional (by [@Varixo](https://github.com/Varixo) in [#8839](https://github.com/QwikDev/qwik/pull/8839))

- 🐞🩹 ensure SPA navigation correctly refreshes route loader data for catch-all routes, including when loader data is shared through context (by [@Varixo](https://github.com/Varixo) in [#8748](https://github.com/QwikDev/qwik/pull/8748))

- 🐞🩹 routeLoader$ fail() now sets the loader value to { failed } instead of throwing an error, as it was before. (by [@wmertens](https://github.com/wmertens) in [#8756](https://github.com/QwikDev/qwik/pull/8756))

- 🐞🩹 prerendered route loaders no longer 404 when the client and server are built as separate processes (by [@briancarbone](https://github.com/briancarbone) in [#8760](https://github.com/QwikDev/qwik/pull/8760))

- 🐞🩹 route loader no longer resolves to undefined on the first dev SPA navigation (by [@briancarbone](https://github.com/briancarbone) in [#8770](https://github.com/QwikDev/qwik/pull/8770))

- 🐞🩹 `routeLoader$` not re-running during SPA navigation between URLs that match the same catchall route (by [@Varixo](https://github.com/Varixo) in [#8730](https://github.com/QwikDev/qwik/pull/8730))

- 🐞🩹 prefix dev CSS and HMR URLs with Vite base (by [@Varixo](https://github.com/Varixo) in [#8837](https://github.com/QwikDev/qwik/pull/8837))

- 🐞🩹 refetch re-exported route loaders after navigation (by [@wmertens](https://github.com/wmertens) in [#8792](https://github.com/QwikDev/qwik/pull/8792))

- 🐞🩹 route action type allows `invalidate` without validators (by [@wmertens](https://github.com/wmertens) in [#8807](https://github.com/QwikDev/qwik/pull/8807))

- 🐞🩹 preserve scroll after spa action submits (by [@Varixo](https://github.com/Varixo) in [#8797](https://github.com/QwikDev/qwik/pull/8797))

- 🐞🩹 hot-reload route-imported CSS in dev without a server restart (by [@briancarbone](https://github.com/briancarbone) in [#8725](https://github.com/QwikDev/qwik/pull/8725))

- 🐞🩹 streaming server$ no longer crashes the Bun server on client disconnect (by [@aggyomfg](https://github.com/aggyomfg) in [#8798](https://github.com/QwikDev/qwik/pull/8798))

- 🐞🩹 register aliased server functions used only in client code like visible tasks (by [@Varixo](https://github.com/Varixo) in [#8818](https://github.com/QwikDev/qwik/pull/8818))

- 🐞🩹 adapter post-build runs with ssg disabled, and the ssg build skips minify/sourcemaps (by [@wmertens](https://github.com/wmertens) in [#8806](https://github.com/QwikDev/qwik/pull/8806))

- 🐞🩹 the ssg build no longer bundles the unused deploy server entry (by [@wmertens](https://github.com/wmertens) in [#8806](https://github.com/QwikDev/qwik/pull/8806))

- 🐞🩹 a prerendered route's loader with no static sidecar now falls through to SSR instead of failing as a missing static asset (by [@briancarbone](https://github.com/briancarbone) in [#8760](https://github.com/QwikDev/qwik/pull/8760))

- 🐞🩹 preserve strict loader URL isolation during route resolution (by [@wmertens](https://github.com/wmertens) in [#8836](https://github.com/QwikDev/qwik/pull/8836))

- 🐞🩹 ensure dev SPA navigation loads route loader data correctly for catch-all and base-prefixed routes (by [@Varixo](https://github.com/Varixo) in [#8805](https://github.com/QwikDev/qwik/pull/8805))

- Updated dependencies [[`96fe9e1`](https://github.com/QwikDev/qwik/commit/96fe9e1ab0364a335eb6c73f29c52c7919222045), [`b0bdbf3`](https://github.com/QwikDev/qwik/commit/b0bdbf39b06f1319e65bd2d1927404eac52d02d6), [`77ae28f`](https://github.com/QwikDev/qwik/commit/77ae28fc2c489ae189627d7a8f16b6af55577318), [`dbdf85f`](https://github.com/QwikDev/qwik/commit/dbdf85f43e387cdc22c36ce37a7364af5935139e), [`570aec5`](https://github.com/QwikDev/qwik/commit/570aec54af282e4082eb48898fa5d79e236157a4), [`b5a74df`](https://github.com/QwikDev/qwik/commit/b5a74df3364a8eaca6dcda9a911b07da7d318e5c), [`3672ae5`](https://github.com/QwikDev/qwik/commit/3672ae5684d50ecaeea6e41a77d9c54b8a9abf74), [`2e2a913`](https://github.com/QwikDev/qwik/commit/2e2a913b9f2e41a7fe0ece00b23f5583579dfd62), [`1921d7a`](https://github.com/QwikDev/qwik/commit/1921d7aab649dadb9983219f1ea2a82ef6f8854f), [`8e75051`](https://github.com/QwikDev/qwik/commit/8e75051373365379c3d60e62962e8cf58efa7bc2), [`e28ae7c`](https://github.com/QwikDev/qwik/commit/e28ae7cf6f42b15b3bb17986c1cd7d7ffd91adee), [`3710734`](https://github.com/QwikDev/qwik/commit/371073430d82ee63e5e7ea45099d8982d4b0ce62), [`e9d5d98`](https://github.com/QwikDev/qwik/commit/e9d5d987e31a94dc485270c57a17ffcba4d77cb6), [`12387da`](https://github.com/QwikDev/qwik/commit/12387daadac9e4500d3ecd30337cfe6efa1d2958), [`e70b299`](https://github.com/QwikDev/qwik/commit/e70b2990e0d2d790330c2f9f09cec1c976b8a9cc), [`9fd1303`](https://github.com/QwikDev/qwik/commit/9fd13034deb207dac109892d26a4721ae84914a9), [`bed0127`](https://github.com/QwikDev/qwik/commit/bed01275184b3c4c0cd5b2cc371bb8edfb8e8994), [`1da9aa6`](https://github.com/QwikDev/qwik/commit/1da9aa6922bd6f8d2a55880aca96e44195e26351), [`f9a0e83`](https://github.com/QwikDev/qwik/commit/f9a0e8341aaf97050938d0ba902ff50e1daf6a18), [`2a47192`](https://github.com/QwikDev/qwik/commit/2a4719239b12e208d02d47e65d460330493c3997), [`3a0df67`](https://github.com/QwikDev/qwik/commit/3a0df6762362ed51e360d0d01d6ec6e669c22b18), [`ee013ae`](https://github.com/QwikDev/qwik/commit/ee013ae349671a7801e29efbcce248c026cb949f), [`d3b6678`](https://github.com/QwikDev/qwik/commit/d3b6678e20e4c7686f06d9bc29d53f50d78e703f), [`885367a`](https://github.com/QwikDev/qwik/commit/885367a31146c6c79c60b908b9eaa755375749a7), [`8fc5762`](https://github.com/QwikDev/qwik/commit/8fc576269a4c3fb77026bcbdf589f2cdc329ee9c), [`03fae8a`](https://github.com/QwikDev/qwik/commit/03fae8a49437d96b7ad7883750307ec7499a18ea), [`fd9f197`](https://github.com/QwikDev/qwik/commit/fd9f197c2774fbad8adb2b007dfa46a0b4698533), [`4917019`](https://github.com/QwikDev/qwik/commit/491701965da5d529d9a6b26686c7fff43529c1ed), [`abaae23`](https://github.com/QwikDev/qwik/commit/abaae232518707219a69e1247a6400cf569f5dd7), [`15ea2d8`](https://github.com/QwikDev/qwik/commit/15ea2d88f0cae45e81f5b1dea231b5f7349da28d)]:
  - @qwik.dev/core@2.0.0-beta.38

## 2.0.0-beta.37

### Major Changes

- BREAKING: Route loaders are now AsyncSignals. This means that `value.failed` is no longer used to indicate a loader failure. Instead, if a loader fails, the error will be stored in `error`, and reading `value` will throw that error. (by [@wmertens](https://github.com/wmertens) in [#8501](https://github.com/QwikDev/qwik/pull/8501))

  This also means that you can now pass `expires`, `poll`, and `allowStale` options to route loaders. See the documentation for more details on these options and how to use them.

- BREAKING: `routeLoader$` cannot read action state any more, so that they are cacheable and predictable. All use cases can be achieved in other ways, like reading the action signal directly in the component or having the loader read from URL-derived state that the action updates. (by [@wmertens](https://github.com/wmertens) in [#8501](https://github.com/QwikDev/qwik/pull/8501))

- BREAKING: Qwik Router no longer retrieves `q-data.json` files on every SPA navigation. You can remove any caching rules for these. (by [@wmertens](https://github.com/wmertens) in [#8501](https://github.com/QwikDev/qwik/pull/8501))

  Instead, Qwik Router now retrieves `q-loader-${hash}.${manifestHash}.json` for RouteLoader data. You can specify expiry for each RouteLoader individually, and it is automatically used to set browser caching headers. The `manifestHash` ensures that when you build a new version of your app, the old cached data will be invalidated and the new data will be fetched.

  The default expiry for RouteLoader data is 2 minutes, so that prefetching and caching of RouteLoader data is useful. You control this with the `expiry` option on each RouteLoader, and you can set it to `0` to disable caching.

  Furthermore, any RouteLoader that has `expiry: 0` will be generated as a file during SSG, which allows SPA navigation to work even without a server.

  Note: Be careful with caching for RouteLoaders that return user-specific data, especially regarding logout and CDN caching. Use low expiry times for these and use `eTag` to still allow caching benefits.

- BREAKING: `cacheKey` functions now get `(requestEv: RequestEvent, eTag: string)` as arguments, instead of `(status: number, eTag: string, pathname: string)` (by [@wmertens](https://github.com/wmertens) in [#8699](https://github.com/QwikDev/qwik/pull/8699))

### Minor Changes

- 🐞🩹 Route loaders now redirect in their JSON response instead of using HTTP redirect (by [@wmertens](https://github.com/wmertens) in [#8501](https://github.com/QwikDev/qwik/pull/8501))

- ✨ route loaders now accept `eTag` to shortcut data retrieval when the data has not changed. See the documentation for more details on this option and how to use it. (by [@wmertens](https://github.com/wmertens) in [#8501](https://github.com/QwikDev/qwik/pull/8501))

- ✨ Routeloaders now support a `cacheKey` and `eTag` property, similar to SSR `pageConfig`. The only difference is that the full value is known before sending, so cached entries generate an ETag before returning the initial request instead of after rendering as with SSR. (by [@wmertens](https://github.com/wmertens) in [#8699](https://github.com/QwikDev/qwik/pull/8699))

- ✨ When `routeConfig` provides a `cacheKey` but no `eTag`, SSR will determine an ETag value by hashing the rendered output. When the cache entry is later retrieved, the ETag is provided to the client and later requests can use the ETag for conditional requests. (by [@wmertens](https://github.com/wmertens) in [#8699](https://github.com/QwikDev/qwik/pull/8699))

- ✨ route loaders now accept `search` to only allow certain query parameters to trigger the loader. This means that random search parameters won't cause the loader to re-run. If you do not pass `search`, then all search parameters will be passed to the loader and will trigger it when they change. (by [@wmertens](https://github.com/wmertens) in [#8501](https://github.com/QwikDev/qwik/pull/8501))

  However, `qwikRouter` now has the option `strictLoaders` which is `true` by default, which means that if you do not specify `search` for a loader, then it will not receive any search parameters and will not re-run when the search parameters change.

### Patch Changes

- fix(router): Update route loader metadata in the dev route trie when route source files change. (by [@wmertens](https://github.com/wmertens) in [#8501](https://github.com/QwikDev/qwik/pull/8501))

- ✨ expose `RequestEvent.internalRequest` for framework-internal JSON requests. (by [@wmertens](https://github.com/wmertens) in [#8698](https://github.com/QwikDev/qwik/pull/8698))

- fix(router): run q-loader requests through the full page middleware chain and handle unfollowed HTTP redirects. (by [@wmertens](https://github.com/wmertens) in [#8698](https://github.com/QwikDev/qwik/pull/8698))

- fix(router): fetch non-serialized route loader data after resume (by [@Varixo](https://github.com/Varixo) in [#8706](https://github.com/QwikDev/qwik/pull/8706))

- 🐞🩹 don't run middleware defined in index.\* for a routeloader on the same path, unless the routeloader is defined in index (by [@wmertens](https://github.com/wmertens) in [#8697](https://github.com/QwikDev/qwik/pull/8697))

- 🐞🩹 fix "assignment to constant variable" errors when route loaders cache filtered search state across SPA navigations (by [@Varixo](https://github.com/Varixo) in [#8709](https://github.com/QwikDev/qwik/pull/8709))

- Updated dependencies [[`d4f40ac`](https://github.com/QwikDev/qwik/commit/d4f40acdcbd437095c34255e878338f1e88f207b), [`a8509c1`](https://github.com/QwikDev/qwik/commit/a8509c1c312a3c9c9434b4050650970807ca38e0), [`9ff0dd4`](https://github.com/QwikDev/qwik/commit/9ff0dd4351154098ae098358089a510ed2e0d770), [`3dcb29b`](https://github.com/QwikDev/qwik/commit/3dcb29b803acb9de1d124fb1ac685b68d647be6c)]:
  - @qwik.dev/core@2.0.0-beta.37

## 2.0.0-beta.36

### Minor Changes

- ✨ make `usePreventNavigate$` and `request.rewrite()` stable by removing their experimental feature flags. (by [@Varixo](https://github.com/Varixo) in [#8631](https://github.com/QwikDev/qwik/pull/8631))

### Patch Changes

- fix(router): SSG builds with edge/worker adapters no longer crash on Rollup (by [@maiieul](https://github.com/maiieul) in [#8673](https://github.com/QwikDev/qwik/pull/8673))

- Updated dependencies [[`f58ad60`](https://github.com/QwikDev/qwik/commit/f58ad60517d41e6886a952e0e52c2219bc64fec8), [`85905cf`](https://github.com/QwikDev/qwik/commit/85905cf2f08bc7b633eb2b376831e0180715dbef), [`612b3bd`](https://github.com/QwikDev/qwik/commit/612b3bd645b065eaf1469416c9096b44ae2daebb), [`d7d965d`](https://github.com/QwikDev/qwik/commit/d7d965d31e58dffd22d17e938847f7fb064e4cbc), [`b9cd8fa`](https://github.com/QwikDev/qwik/commit/b9cd8fa3def420b878023cb7d7ba2e840aa3d467), [`93cdfe5`](https://github.com/QwikDev/qwik/commit/93cdfe5e5d0c095197354ebaf69560dbfd46b9b1), [`bdbd076`](https://github.com/QwikDev/qwik/commit/bdbd07647760a230015a0fe3842b4a00e1a12094), [`5098ffa`](https://github.com/QwikDev/qwik/commit/5098ffa3899418570f7ceb18b27f6b38f22812db), [`6e00744`](https://github.com/QwikDev/qwik/commit/6e00744fb604943ee15930b57960954e74000299), [`ce6a45e`](https://github.com/QwikDev/qwik/commit/ce6a45e8908645a6ce0be3faa260824ae26c0fb7), [`137c075`](https://github.com/QwikDev/qwik/commit/137c0753547fb768524e00a19e972545b988d55c), [`5fd7174`](https://github.com/QwikDev/qwik/commit/5fd71742091c703d37c786a3650705a4d0af7221), [`23af20e`](https://github.com/QwikDev/qwik/commit/23af20e3662b060b2210eb8efa3d5857b9c752a9), [`42104ec`](https://github.com/QwikDev/qwik/commit/42104ec3d184955ea8f1299df3df20a3d754334f), [`0b52ad2`](https://github.com/QwikDev/qwik/commit/0b52ad2ec06d89779caabd9726eaa80118f08b1b)]:
  - @qwik.dev/core@2.0.0-beta.36

## 2.0.0-beta.35

### Minor Changes

- ✨ add worker$ support running heavy work in Web Workers (by [@Varixo](https://github.com/Varixo) in [#8572](https://github.com/QwikDev/qwik/pull/8572))

### Patch Changes

- fix(router): Node SSR no longer hangs when using `compression` (or other middleware that wraps `res.write` / `res.end`). (by [@maiieul](https://github.com/maiieul) in [#8620](https://github.com/QwikDev/qwik/pull/8620))

- 🐞🩹 handle aborted Node response streams without crashing and resolve the Node response stream contract (by [@Varixo](https://github.com/Varixo) in [#8613](https://github.com/QwikDev/qwik/pull/8613))

- fix(router): The Vite dev won't crash anymore when `src/entry.ssr` is missing (e.g. in monorepos) (by [@maiieul](https://github.com/maiieul) in [#8601](https://github.com/QwikDev/qwik/pull/8601))

- 🐞🩹 handle callback-only response end in Vite HTML transform (by [@Varixo](https://github.com/Varixo) in [#8597](https://github.com/QwikDev/qwik/pull/8597))

- Updated dependencies [[`8fdf639`](https://github.com/QwikDev/qwik/commit/8fdf6393312a10407db8d9a0b0199d77e2a208c7), [`8dbdc12`](https://github.com/QwikDev/qwik/commit/8dbdc1253d7ab4fe9bcef520d79b1c85aac3b372), [`b6f7556`](https://github.com/QwikDev/qwik/commit/b6f755677abc91b4a873afa2b50930d4354ecee9), [`5cb730f`](https://github.com/QwikDev/qwik/commit/5cb730f56b2500fca0c0acd06249f8b1f4612f40), [`c5f5bb0`](https://github.com/QwikDev/qwik/commit/c5f5bb0c89037848db7c7aee90e0d6daf2f97d3e), [`dc9a8e8`](https://github.com/QwikDev/qwik/commit/dc9a8e8ba830663c5b4ef1297079a976d8b258c6), [`ea33c02`](https://github.com/QwikDev/qwik/commit/ea33c02d179a52e438446ad3d511c1e77e45fa79), [`b90aa3f`](https://github.com/QwikDev/qwik/commit/b90aa3fa64464fda83b790f5f8f122a2a8e7ea5b), [`a8e3dc0`](https://github.com/QwikDev/qwik/commit/a8e3dc0694954aee6d9348b85a5c6cbb9b05b71d), [`5fd8f65`](https://github.com/QwikDev/qwik/commit/5fd8f65c5c7999785304580a92f7bfc7b57a9e68)]:
  - @qwik.dev/core@2.0.0-beta.35

## 2.0.0-beta.34

### Patch Changes

- fix(core): Q3 error "Only primitive and object literals can be serialized" no longer throws for route loaders and actions. (by [@maiieul](https://github.com/maiieul) in [#8592](https://github.com/QwikDev/qwik/pull/8592))

  fix(router): `QwikRouterMockProvider`'s `loaders` mocks stopped working due to a V2 refactor. They now properly mimick V2's implementation and work as expected.

- Updated dependencies [[`bbc7916`](https://github.com/QwikDev/qwik/commit/bbc79162eb9c0ecbd0a066a7ef440ee5a8a27c43)]:
  - @qwik.dev/core@2.0.0-beta.34

## 2.0.0-beta.33

### Minor Changes

- ✨ add configurable Link component prefetch data strategies (by [@Varixo](https://github.com/Varixo) in [#8548](https://github.com/QwikDev/qwik/pull/8548))

### Patch Changes

- 🐞🩹 Node SSR streaming to honor downstream backpressure (by [@Varixo](https://github.com/Varixo) in [#8557](https://github.com/QwikDev/qwik/pull/8557))

- Updated dependencies [[`1d532e2`](https://github.com/QwikDev/qwik/commit/1d532e2e34cda06c0edde5a0609f5ab1f873b811), [`3755593`](https://github.com/QwikDev/qwik/commit/375559368bb849d460d044c1bb9a3bafa8d38c94), [`ae7e595`](https://github.com/QwikDev/qwik/commit/ae7e595bae8383bf46a20cf6fa92356698c7abf2), [`dbb1541`](https://github.com/QwikDev/qwik/commit/dbb154108c5279f68b48dc02aab762cd51fc787d)]:
  - @qwik.dev/core@2.0.0-beta.33

## 2.0.0-beta.32

### Minor Changes

- ✨ the `notFound` exports of the router factory functions no longer do anything, because the `router` exports handle not-found routes. (by [@wmertens](https://github.com/wmertens) in [#8534](https://github.com/QwikDev/qwik/pull/8534))

### Patch Changes

- 🐞🩹 intermittent Deno build failure in apps that use async tasks (by [@Varixo](https://github.com/Varixo) in [#8550](https://github.com/QwikDev/qwik/pull/8550))

- 🐞🩹 fix an SPA routing bug where using browser back/forward after a manual refresh could change the URL without rerendering the page (by [@Varixo](https://github.com/Varixo) in [#8544](https://github.com/QwikDev/qwik/pull/8544))

- 🐞🩹 image imports `foo.png?jsx` are now more robust (by [@wmertens](https://github.com/wmertens) in [#8533](https://github.com/QwikDev/qwik/pull/8533))

- Updated dependencies [[`ccb7579`](https://github.com/QwikDev/qwik/commit/ccb7579d4db0d63c106ed3f5e221fd52dbab6c92), [`06d82e0`](https://github.com/QwikDev/qwik/commit/06d82e0d657f56e4d767bbcc0aab3dacf9be50ba), [`7ae409d`](https://github.com/QwikDev/qwik/commit/7ae409deb7432f800c1a33206108e059cc4af1dd), [`e3eaa4e`](https://github.com/QwikDev/qwik/commit/e3eaa4efbd8afba3f5541f772ecd63ec9775d8a6), [`7ae409d`](https://github.com/QwikDev/qwik/commit/7ae409deb7432f800c1a33206108e059cc4af1dd), [`06d82e0`](https://github.com/QwikDev/qwik/commit/06d82e0d657f56e4d767bbcc0aab3dacf9be50ba), [`d4def9d`](https://github.com/QwikDev/qwik/commit/d4def9de48174787d9944a161cb6a9627764c714), [`fe3c4e2`](https://github.com/QwikDev/qwik/commit/fe3c4e23a1bf6e12842ad88f6392f3d62a5db80b)]:
  - @qwik.dev/core@2.0.0-beta.32

## 2.0.0-beta.31

### Minor Changes

- ✨ `documentHead` now includes the manifest hash, which can be used for cache busting or eTag generation. (by [@wmertens](https://github.com/wmertens) in [#8503](https://github.com/QwikDev/qwik/pull/8503))

### Patch Changes

- 🐞🩹 Some smaller fixes to the router: (by [@wmertens](https://github.com/wmertens) in [#8503](https://github.com/QwikDev/qwik/pull/8503))
  - prevent crashing due to container missing during navigation
  - don't append `/` to paths that are not known
  - remove `qwikRouterConfig` from router creation, it's entirely internally managed

- Updated dependencies [[`dabcbdf`](https://github.com/QwikDev/qwik/commit/dabcbdfd4c060e1b561af67c6b030e6e06f30d1a), [`cf1544f`](https://github.com/QwikDev/qwik/commit/cf1544f6cd46cc16d76a07be45dfd70b79160b3e), [`c491ceb`](https://github.com/QwikDev/qwik/commit/c491ceba151b7356e936acd6566daa9a19916d56), [`74fdc9d`](https://github.com/QwikDev/qwik/commit/74fdc9d935520455974a4e13beeae1ab11a48629), [`60b52cd`](https://github.com/QwikDev/qwik/commit/60b52cd0d63405d79c62d6016ba888cddca86cde), [`251e213`](https://github.com/QwikDev/qwik/commit/251e213dae1206c00b54375aa04297d1d15f9bbb)]:
  - @qwik.dev/core@2.0.0-beta.31

## 2.0.0-beta.30

### Patch Changes

- 🐞🩹 SPA navigation should not be skipped on webkit engine (by [@Varixo](https://github.com/Varixo) in [#8446](https://github.com/QwikDev/qwik/pull/8446))

- Updated dependencies [[`8100990`](https://github.com/QwikDev/qwik/commit/810099008ff0468d5c531842e9588b52a4c09e34), [`ca477f8`](https://github.com/QwikDev/qwik/commit/ca477f86a8616a80ec278ae6db6c264d965f2e85), [`7404b3b`](https://github.com/QwikDev/qwik/commit/7404b3b79b33341176f0e57e7aafea564ea04f68), [`bc8487d`](https://github.com/QwikDev/qwik/commit/bc8487d62cbd2177fca11af830ac08ca3b267d5e), [`e10382a`](https://github.com/QwikDev/qwik/commit/e10382aba5a0db50891e9b072982f48d2d68a467), [`3f1ede7`](https://github.com/QwikDev/qwik/commit/3f1ede71c7b1a646ad6f9a86669eb8f387c153e8), [`b04c6b3`](https://github.com/QwikDev/qwik/commit/b04c6b3b95888b0db7df7ada33bfb5bbbda5dd19), [`d82733c`](https://github.com/QwikDev/qwik/commit/d82733cb95ddb5283a2e7ad051cbe2357cd3a35d)]:
  - @qwik.dev/core@2.0.0-beta.30

## 2.0.0-beta.29

### Major Changes

- BREAKING: The route configuration object has changed. The routes are now a more efficient trie structure and the config no longer includes `menus`. This should not impact you. (by [@wmertens](https://github.com/wmertens) in [#8414](https://github.com/QwikDev/qwik/pull/8414))

### Minor Changes

- ✨ SSG now runs in a separate process using Workers, and it can be re-run by running `server/run-ssg.js` (by [@wmertens](https://github.com/wmertens) in [#8414](https://github.com/QwikDev/qwik/pull/8414))

- ✨ eTag and in-memory cache for SSR pages. You can define an `eTag` property on your page modules, which will be used to generate an ETag header for the response, and which is checked before rendering the page, returning 304 if possible. (by [@wmertens](https://github.com/wmertens) in [#8414](https://github.com/QwikDev/qwik/pull/8414))
  If you define a `cacheKey` function on your page module, it will be used to generate a cache key for the page, which is used to store the rendered HTML in an in-memory cache. This allows for faster responses for pages that are expensive to render and do not change often. The cache can be cleared using the `clearSsrCache` function from the request handler middleware.

- ✨ Add `routeConfig` export as a unified alternative to separate `head`, `eTag`, and `cacheKey` exports (by [@wmertens](https://github.com/wmertens) in [#8414](https://github.com/QwikDev/qwik/pull/8414))

  The new `routeConfig` export groups all page-level configuration into a single export with the same resolution rules as `head` (static object or function). When a module exports `routeConfig`, separate `head`, `eTag`, and `cacheKey` exports on that module are ignored.

- ✨ Custom `404.tsx` error pages are now shown in dev mode, and you can now also create `error.tsx` pages for other HTTP status codes. (by [@wmertens](https://github.com/wmertens) in [#8414](https://github.com/QwikDev/qwik/pull/8414))
  Read the HTTP status with `useHttpStatus()`.

### Patch Changes

- fix(router): make sure css gets found on the correct module graph (by [@saboooor](https://github.com/saboooor) in [#8423](https://github.com/QwikDev/qwik/pull/8423))

- Updated dependencies []:
  - @qwik.dev/core@2.0.0-beta.29

## 2.0.0-beta.28

### Minor Changes

- ✨ the Vite environment API is now better supported. This means that you can build multiple environments simultaneously without Qwik having a problem, with `vite build --app`. (by [@wmertens](https://github.com/wmertens) in [#6903](https://github.com/QwikDev/qwik/pull/6903))

  However, Qwik Router adapters still require running `build.server` separately for now because they use a different vite configuration file.

  The minimum supported version of Vite is now 6.0.0.

- ✨ Hot Module Replacement (HMR) support. You now get instant updates in the browser when you change your source code, without losing state. This happens without forcing a resume at load, so everything is fast. (by [@wmertens](https://github.com/wmertens) in [#8421](https://github.com/QwikDev/qwik/pull/8421))
  The slight disadvantage is that all components now send their state during development (because now they can always rerender on the client). You can disable HMR and fall back to full page reloads by setting `{devTools: {hmr: false}}` in the `qwikVite()` plugin configuration.

### Patch Changes

- Updated dependencies [[`640e8d3`](https://github.com/QwikDev/qwik/commit/640e8d31dab44540adc0c15ea19c829e836a7c94), [`d304830`](https://github.com/QwikDev/qwik/commit/d30483000452f7df0df4ce34070039c80c4718f2)]:
  - @qwik.dev/core@2.0.0-beta.28

## 2.0.0-beta.27

### Patch Changes

- Updated dependencies [[`e8158b9`](https://github.com/QwikDev/qwik/commit/e8158b96be68e2423fcb3da4362e46920d6af03e), [`e8158b9`](https://github.com/QwikDev/qwik/commit/e8158b96be68e2423fcb3da4362e46920d6af03e), [`e8158b9`](https://github.com/QwikDev/qwik/commit/e8158b96be68e2423fcb3da4362e46920d6af03e)]:
  - @qwik.dev/core@2.0.0-beta.27

## 2.0.0-beta.26

### Minor Changes

- ✨ rewrite absolute url error will throw 400 instead of 500 (by [@Varixo](https://github.com/Varixo) in [#8389](https://github.com/QwikDev/qwik/pull/8389))

### Patch Changes

- 🐞🩹 Server-Timing header should be available in dev mode (by [@Varixo](https://github.com/Varixo) in [#8389](https://github.com/QwikDev/qwik/pull/8389))

- Updated dependencies [[`82edabf`](https://github.com/QwikDev/qwik/commit/82edabfedb59ef817ae2c37ae8e4e67dbee26a3f), [`827f389`](https://github.com/QwikDev/qwik/commit/827f38924a17bd6a5bc808fb61f791cb8ed1f6a0), [`a22a98d`](https://github.com/QwikDev/qwik/commit/a22a98d363fecec6da736cf1655ea9b5f27c19f4), [`f64f15f`](https://github.com/QwikDev/qwik/commit/f64f15f60ca7009dcf4101604ad9c58edd777e06)]:
  - @qwik.dev/core@2.0.0-beta.26

## 2.0.0-beta.25

### Patch Changes

- Updated dependencies [[`232a9f5`](https://github.com/QwikDev/qwik/commit/232a9f525d22fbcf4cbb10b954555d2051c1aec3), [`0ec8a0c`](https://github.com/QwikDev/qwik/commit/0ec8a0cb84fc42bbd79b145f511676fcf17db977), [`20a9d64`](https://github.com/QwikDev/qwik/commit/20a9d64169c9467627fc4d5e4a1d1f55dea83ade), [`cc7ac1c`](https://github.com/QwikDev/qwik/commit/cc7ac1c0391e01b01e6768b1fe92c2c0da9b2327), [`dc3c216`](https://github.com/QwikDev/qwik/commit/dc3c216b80236c00d2efc6b72ef82ce53030b147)]:
  - @qwik.dev/core@2.0.0-beta.25

## 2.0.0-beta.24

### Patch Changes

- Updated dependencies [[`a986de2`](https://github.com/QwikDev/qwik/commit/a986de20bde8489bf41e8d543754b0cf228dbd86), [`d36a103`](https://github.com/QwikDev/qwik/commit/d36a1031a123b7fa39db1193f1b92d0468f30b68), [`37fa0a7`](https://github.com/QwikDev/qwik/commit/37fa0a7437886d1d236e9099b04c4af9cef3aee6), [`59fadcf`](https://github.com/QwikDev/qwik/commit/59fadcf8f8edf5b309762c3aa3b3feba3bfc4d3d), [`37cb49e`](https://github.com/QwikDev/qwik/commit/37cb49e2418c4bfbc97cf27791e71fc34966d84d), [`fb5c9f3`](https://github.com/QwikDev/qwik/commit/fb5c9f39f732b1ca7986108bcc559e9601df93a9), [`adc03b1`](https://github.com/QwikDev/qwik/commit/adc03b1caa82ea3f9b43541e7f20a976cb1a5641), [`7d4f8ae`](https://github.com/QwikDev/qwik/commit/7d4f8aec6e4267f48c96c801a5587f6ee358b842), [`bedef2e`](https://github.com/QwikDev/qwik/commit/bedef2e8ef9f72efd0634c4f562005be90911232)]:
  - @qwik.dev/core@2.0.0-beta.24

## 2.0.0-beta.23

### Patch Changes

- Updated dependencies []:
  - @qwik.dev/core@2.0.0-beta.23

## 2.0.0-beta.22

### Patch Changes

- Updated dependencies [[`93636f3`](https://github.com/QwikDev/qwik/commit/93636f3a41c1c37c2d2199be1cf1fbb0979a6d70), [`efa0a01`](https://github.com/QwikDev/qwik/commit/efa0a0110098fa6aa9a6c917779901cb6001a451), [`6f9200a`](https://github.com/QwikDev/qwik/commit/6f9200a38647fc02b230fd1ca4a44b74c9b5b177)]:
  - @qwik.dev/core@2.0.0-beta.22

## 2.0.0-beta.21

### Patch Changes

- Updated dependencies [[`831947d`](https://github.com/QwikDev/qwik/commit/831947d3528de7afa48876b90beaf5b826e64595)]:
  - @qwik.dev/core@2.0.0-beta.21

## 2.0.0-beta.20

### Patch Changes

- 🐞🩹 ignore .well-known path (by [@Varixo](https://github.com/Varixo) in [#8295](https://github.com/QwikDev/qwik/pull/8295))

- Updated dependencies [[`fc0e457`](https://github.com/QwikDev/qwik/commit/fc0e457ed6214f7e6781e6731f7ffe508973acea), [`835ebdf`](https://github.com/QwikDev/qwik/commit/835ebdfa75bdf05b1d14db5310fda99e57551426), [`98ec1f7`](https://github.com/QwikDev/qwik/commit/98ec1f7fe2a5d120cd83df430f7a5c84b0810298)]:
  - @qwik.dev/core@2.0.0-beta.20

## 2.0.0-beta.19

### Patch Changes

- Updated dependencies [[`ef7f3be`](https://github.com/QwikDev/qwik/commit/ef7f3bed4f5d89e0ff5bb06a6e185ec45e48f9fc)]:
  - @qwik.dev/core@2.0.0-beta.19

## 2.0.0-beta.18

### Patch Changes

- 🐞🩹 navigate to new page even if transition is failed (by [@Varixo](https://github.com/Varixo) in [#8271](https://github.com/QwikDev/qwik/pull/8271))

- Updated dependencies [[`4fdff10`](https://github.com/QwikDev/qwik/commit/4fdff105ba29c4a2793fcc196cee283a7d709cd5), [`a4ae2ef`](https://github.com/QwikDev/qwik/commit/a4ae2ef19d2802dd3afa2ddf7c7e6b8431198e36), [`5f9af9e`](https://github.com/QwikDev/qwik/commit/5f9af9e95f522d74d72fe6c6df680ac95618f829), [`e83a97d`](https://github.com/QwikDev/qwik/commit/e83a97d7bdf799b1510a352b90b6f44b25af11f9), [`68e723a`](https://github.com/QwikDev/qwik/commit/68e723ae5526064813c95072f9a18e1af23e90cb), [`8829960`](https://github.com/QwikDev/qwik/commit/88299606d7977ae54d4d4e131472812cf3ed6bdb), [`d92665e`](https://github.com/QwikDev/qwik/commit/d92665e800b55ec2fef7f06c9cca317bb8c79493), [`6e73033`](https://github.com/QwikDev/qwik/commit/6e7303326759a9ecafa27e63adf6ac01f09fc6c9), [`0ce16bc`](https://github.com/QwikDev/qwik/commit/0ce16bc17836ae02ce210783dc78350980ec9e98), [`f0dbc1c`](https://github.com/QwikDev/qwik/commit/f0dbc1c64048ad5157cae42dc34494fa4b8d1010), [`7606dbe`](https://github.com/QwikDev/qwik/commit/7606dbe570ee0e97a2d26d0b0f69d3e499ea83b5), [`e8ffc2b`](https://github.com/QwikDev/qwik/commit/e8ffc2b0cd7725ffa8f57f9d03aa33ed05de7ac0), [`df3ed1a`](https://github.com/QwikDev/qwik/commit/df3ed1acbe8b818bf20ee4ec1a4ef7ac35e57843), [`253d190`](https://github.com/QwikDev/qwik/commit/253d1905e0dde9f8c363ac2dfd9835201d8b3db9), [`8e6f545`](https://github.com/QwikDev/qwik/commit/8e6f545576e49a989fb7f28f439658cd98866fb0)]:
  - @qwik.dev/core@2.0.0-beta.18

## 2.0.0-beta.17

### Patch Changes

- Updated dependencies [[`5680f10`](https://github.com/QwikDev/qwik/commit/5680f109180bae1028fd2589f2ecbde655ace6c0), [`d1d9c65`](https://github.com/QwikDev/qwik/commit/d1d9c65f44c928597b95ef3d2ec7afc0c7ae904d), [`7f1aaa2`](https://github.com/QwikDev/qwik/commit/7f1aaa2a97e0944ac032e3753641272f7bccc9ec), [`d7b141d`](https://github.com/QwikDev/qwik/commit/d7b141d91b74af8187e2f6a19e74bb8ce7391d17)]:
  - @qwik.dev/core@2.0.0-beta.17

## 2.0.0-beta.16

### Patch Changes

- Updated dependencies [[`27d4724`](https://github.com/QwikDev/qwik/commit/27d4724ba25197862fcf398c42ab65d033aa30e0)]:
  - @qwik.dev/core@2.0.0-beta.16

## 2.0.0-beta.15

### Patch Changes

- Updated dependencies [[`8af7775`](https://github.com/QwikDev/qwik/commit/8af7775a53c2ddb952b04360a79106b5c500b822), [`1fc309c`](https://github.com/QwikDev/qwik/commit/1fc309cc59227aa4913e70c0749e0c2aacc190db), [`23b3dcd`](https://github.com/QwikDev/qwik/commit/23b3dcddc25a1988ec96c024acd71e2a931edff4), [`86e3a98`](https://github.com/QwikDev/qwik/commit/86e3a98a4ee8fb53ffe0c26bf2788749ed949ff6), [`9627e22`](https://github.com/QwikDev/qwik/commit/9627e2211e07754f57dfb58aeabea96a47b58cfe), [`f026a32`](https://github.com/QwikDev/qwik/commit/f026a326ad2914a4e124602b6d491323928ffb73), [`12fee1f`](https://github.com/QwikDev/qwik/commit/12fee1f322a4645105acb9dc9522ff48f3b10291), [`dce9976`](https://github.com/QwikDev/qwik/commit/dce9976fb80a9d9f5f4e2a6f862c712c24993223)]:
  - @qwik.dev/core@2.0.0-beta.15

## 2.0.0-beta.14

### Major Changes

- BREAKING: the CJS/UMD builds have been removed; ESM is well-supported everywhere and allows better optimizations. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#8103](https://github.com/QwikDev/qwik/pull/8103))

### Minor Changes

- ✨ extend routeLoader$ signal type and eslint rule (by [@Varixo](https://github.com/Varixo) in [#8126](https://github.com/QwikDev/qwik/pull/8126))

### Patch Changes

- Updated dependencies [[`2d69c94`](https://github.com/QwikDev/qwik/commit/2d69c9421bb5dd81aa884def45d5059e2bd8c31f), [`d8767fb`](https://github.com/QwikDev/qwik/commit/d8767fb3ff186446aa7254047c28ee2292133c63), [`3bbd3d8`](https://github.com/QwikDev/qwik/commit/3bbd3d8040b6bf12e62b1e92570ec34df7ea5a72), [`e20e531`](https://github.com/QwikDev/qwik/commit/e20e53148d59dd370774552b4bfb69129547523e), [`022969a`](https://github.com/QwikDev/qwik/commit/022969ace44a07a40ab73daeae0e414fc3200ba9), [`0c81e2a`](https://github.com/QwikDev/qwik/commit/0c81e2aecffea24e2539a7750fcddb9547f2d863), [`a369eeb`](https://github.com/QwikDev/qwik/commit/a369eebb2637fbd46ca13960277e9c45f41422b7), [`0a69921`](https://github.com/QwikDev/qwik/commit/0a69921049732b732d39bc36824ab1f11d68c21e), [`dd12f2f`](https://github.com/QwikDev/qwik/commit/dd12f2f7df28ef4cc480a01498b0c573307b2644)]:
  - @qwik.dev/core@2.0.0-beta.14

## 2.0.0-beta.13

### Patch Changes

- Updated dependencies [[`bd53d10`](https://github.com/QwikDev/qwik/commit/bd53d109adfee68209c512a714c26da4202d8c7e), [`2c85df4`](https://github.com/QwikDev/qwik/commit/2c85df498514334be05e5a86fe27557195db7f65), [`822feb0`](https://github.com/QwikDev/qwik/commit/822feb0a8258c56c407c75508a2f8f19ad8e2a31), [`e1ca73e`](https://github.com/QwikDev/qwik/commit/e1ca73eaa230eb012f77f6ffa77a943e4d65f22f), [`2403f6a`](https://github.com/QwikDev/qwik/commit/2403f6a38aa9e45a4a068bd237c72375e6db61db)]:
  - @qwik.dev/core@2.0.0-beta.13

## 2.0.0-beta.12

### Minor Changes

- ✨ if a server$ function throws an error that is not a `ServerError`, it will now log the error on the server (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7826](https://github.com/QwikDev/qwik/pull/7826))

### Patch Changes

- ✨ withLocale() uses AsyncLocalStorage for server-side requests when available. This allows async operations to retain the correct locale context. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7826](https://github.com/QwikDev/qwik/pull/7826))

- Updated dependencies [[`3167c1f`](https://github.com/QwikDev/qwik/commit/3167c1fca733f64d50a182ab8e3a22408728c4b5), [`dbd78f6`](https://github.com/QwikDev/qwik/commit/dbd78f6ecfcd7f2d87658e59200455ca3b0436f7), [`5ffe97c`](https://github.com/QwikDev/qwik/commit/5ffe97c8f0b17a33679f9a51f81903d242ef6653), [`d48c3d2`](https://github.com/QwikDev/qwik/commit/d48c3d2f466be1cc5f3fbcce6d827178f81be497), [`96514d3`](https://github.com/QwikDev/qwik/commit/96514d365a1f410e55859652272e21afa75d516c), [`bdc690d`](https://github.com/QwikDev/qwik/commit/bdc690ddfdf89caf63b83132d029ea1b90947f6f), [`0793bb4`](https://github.com/QwikDev/qwik/commit/0793bb42ecc65aae4e5ad90b2421cbc43b7fbe1c), [`66a3cc8`](https://github.com/QwikDev/qwik/commit/66a3cc81b14d6a4c3e6487fb4199be0c3a8fc8e5), [`4794f2a`](https://github.com/QwikDev/qwik/commit/4794f2a5342a64d5b85284f5d14ca7a2740be156), [`3167c1f`](https://github.com/QwikDev/qwik/commit/3167c1fca733f64d50a182ab8e3a22408728c4b5), [`117116d`](https://github.com/QwikDev/qwik/commit/117116db64649e9686c0382229704acc33d8ec5f), [`74c570c`](https://github.com/QwikDev/qwik/commit/74c570c22436cbd5417ae4036f309ccdb3d72dc4), [`7d809e7`](https://github.com/QwikDev/qwik/commit/7d809e7471d655f9fceda0b9ecd9f0a3973dc87f)]:
  - @qwik.dev/core@2.0.0-beta.12

## 2.0.0-beta.11

### Major Changes

- 💥 Breaking (slightly): The order of head export merging has been slightly. Plain objects now override outer ones. Functions still are run inner-first. (by [@wmertens](https://github.com/wmertens) in [#7970](https://github.com/QwikDev/qwik/pull/7970))

### Patch Changes

- 🐞🩹 trim script added by vite in dev mode (by [@Varixo](https://github.com/Varixo) in [#7981](https://github.com/QwikDev/qwik/pull/7981))

- Updated dependencies [[`ceaa368`](https://github.com/QwikDev/qwik/commit/ceaa36852711ca0fdf9045cea039bec6ac24a560), [`0581cba`](https://github.com/QwikDev/qwik/commit/0581cba3d902af54434230357d870481d99d626e), [`991cec0`](https://github.com/QwikDev/qwik/commit/991cec0ba8ede1782e26ac9c25061855a9e6f07c)]:
  - @qwik.dev/core@2.0.0-beta.11

## 2.0.0-beta.10

### Minor Changes

- ✨ split Qwik Core and Router dev experience. Core now only adjusts the html using the Vite hook for it, so it can work in any environment or client-only. You can make a Qwik application client-only by running `qwik add csr` now. (by [@wmertens](https://github.com/wmertens) in [#7890](https://github.com/QwikDev/qwik/pull/7890))
- ✨ Qwik Route now runs dev mode using the node middleware, which is the same as production, and can now hot-reload when routes are added. It does this by transforming the response while it streams to add the dev scripts. This opens the door for Vite Environment support.
- ✨ `qwikVite()` SSR builds now reads the manifest from the client build whenever possible. You can still pass in the manifest yourself if needed.
- 🐞🩹 Qwik Router's Vite plugin no longer imports Qwik Core, a cause of duplicate imports in dev and preview mode.
- 🐞🩹 Sometimes, SSG hangs after completion. The cause is still unknown, but now there is a workaround by forcing the process to exit after SSG is done.

### Patch Changes

- Updated dependencies [[`60ffa2e`](https://github.com/QwikDev/qwik/commit/60ffa2ee21090ffc3d4d2bb6eaaf6d7e33089286), [`68ca2ef`](https://github.com/QwikDev/qwik/commit/68ca2ef1ba73c2d12cbb98196675b105bdd2531e)]:
  - @qwik.dev/core@2.0.0-beta.10

## 2.0.0-beta.9

### Patch Changes

- 🐞🩹 trigger params change after navigation (by [@Varixo](https://github.com/Varixo) in [#7816](https://github.com/QwikDev/qwik/pull/7816))

## 2.0.0-beta.8

### Patch Changes

- 🐞🩹 Zod validator uses defined locale for the current request (by [@knoid](https://github.com/knoid) in [#7804](https://github.com/QwikDev/qwik/pull/7804))

## 2.0.0-beta.7

### Minor Changes

- ✨ useQwikRouter() hook replaces QwikRouterProvider. This gives access to the context immediately and is slightly more efficient. (by [@wmertens](https://github.com/wmertens) in [#7731](https://github.com/QwikDev/qwik/pull/7731))

- ✨ add `DocumentHeadTags` component and make the `head.styles` and `head.scripts` types more like the `head.meta` and `head.links` types. (by [@wmertens](https://github.com/wmertens) in [#7775](https://github.com/QwikDev/qwik/pull/7775))

- ✨ `createRenderer()` wraps the `renderToStream()` function with Qwik Router types, for nicer `entry.ssr` files. (by [@wmertens](https://github.com/wmertens) in [#7770](https://github.com/QwikDev/qwik/pull/7770))

- ✨ You can now put `documentHead` into the rendering functions as part of the `serverData` option. This is useful for passing title, meta tags, scripts, etc. to the `useDocumentHead()` hook from within the server. (by [@wmertens](https://github.com/wmertens) in [#7770](https://github.com/QwikDev/qwik/pull/7770))

## 2.0.0-beta.6

### Minor Changes

- ✨ qwikRouter middleware no longer needs qwikRouterConfig, it handles it internally (by [@wmertens](https://github.com/wmertens) in [#7748](https://github.com/QwikDev/qwik/pull/7748))

- 🐞🩹 the SSR internal build imports `@qwik-router-not-found-paths` and `@qwik-router-static-paths` are no longer used. Instead, the data is embedded directly. This might be a breaking change for some users that forked an adapter, in that case just remove the imports. (by [@wmertens](https://github.com/wmertens) in [#7755](https://github.com/QwikDev/qwik/pull/7755))

### Patch Changes

- Bugfix - rename the view transition type in CSS to prevent default view transition on SPA navigation (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#7713](https://github.com/QwikDev/qwik/pull/7713))

- 🐞🩹 getting invoke context for loaders in production (by [@Varixo](https://github.com/Varixo) in [#7730](https://github.com/QwikDev/qwik/pull/7730))

- ✨ Server output chunk files are now under their own build/ subdir, like the client build. This makes it easier to override the chunk filenames. This is possible because the Router metadata files are now an earlier part of the build process. (by [@wmertens](https://github.com/wmertens) in [#7748](https://github.com/QwikDev/qwik/pull/7748))

## 2.0.0-beta.5

### Patch Changes

- 🐞🩹 adding popstate and scroll event for SPA navigation (by [@Varixo](https://github.com/Varixo) in [#7706](https://github.com/QwikDev/qwik/pull/7706))

- 🐞🩹 nested not serialized loaders (by [@Varixo](https://github.com/Varixo) in [#7704](https://github.com/QwikDev/qwik/pull/7704))

## 2.0.0-beta.4

### Minor Changes

- ✨ implement route loaders serialization RFC with the correct "data shaken" (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

## 2.0.0-beta.3

## 2.0.0-beta.2

## 2.0.0-beta.1

### Patch Changes

- Implement View Transition on SPA navigation (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#7391](https://github.com/QwikDev/qwik/pull/7391))

## 2.0.0-alpha.10

## 2.0.0-alpha.9

## 2.0.0-alpha.8

### Patch Changes

- 🐞🩹 using routeLoader$ result as component prop (by [@Varixo](https://github.com/Varixo) in [#7384](https://github.com/QwikDev/qwik/pull/7384))

## 2.0.0-alpha.7

## 2.0.0-alpha.6

## 2.0.0-alpha.5

## 2.0.0-alpha.4

## 2.0.0-alpha.3

## 2.0.0-alpha.2

## 2.0.0-alpha.1

## 2.0.0-alpha.0

### Major Changes

- Renamed "Qwik City" to "Qwik Router" and package to "@qwik.dev/router" (by [@shairez](https://github.com/shairez) in [#7008](https://github.com/QwikDev/qwik/pull/7008))

## 1.19.0

### Minor Changes

- ✨ allow mocking route loaders & actions in `QwikCityMockProvider` (by [@alexismch](https://github.com/alexismch) in [#8102](https://github.com/QwikDev/qwik/pull/8102))

### Patch Changes

- 🐞🩹 qwik-city spa routeStateInternal and routeLocation url origins mismatch (by [@maiieul](https://github.com/maiieul) in [#8234](https://github.com/QwikDev/qwik/pull/8234))

- feat(qwik-city): add getOrigin option to QwikCityBunOptions and QwikCityDenoOptions for improved URL handling (by [@JerryWu1234](https://github.com/JerryWu1234) in [#8251](https://github.com/QwikDev/qwik/pull/8251))

- Make RequestEvents readonly instead of frozen (by [@DustinJSilk](https://github.com/DustinJSilk) in [#8135](https://github.com/QwikDev/qwik/pull/8135))

## 1.18.0

### Patch Changes

- execute cleanup cb for all component tree while calling dispose.cleanup method returned by render fn (by [@sashkashishka](https://github.com/sashkashishka) in [#8164](https://github.com/QwikDev/qwik/pull/8164))

## 1.17.2

### Patch Changes

- 🐞🩹 history behavior in some edge cases has been brought inline with the E2E tests that were accidentally disabled. (the tests can't be disabled any more either) (by [@wmertens](https://github.com/wmertens) in [`206f3e0`](https://github.com/QwikDev/qwik/commit/206f3e07caad5a5736f160c09a618f348896860d))

- 🐞🩹 SPA routing is broken unless origin matches value in in vite.config #8093 (by [@termermc](https://github.com/termermc) in [#8097](https://github.com/QwikDev/qwik/pull/8097))

  If the SSG origin was set to `localhost:3000` and a user visited from `127.0.0.1:3000`, SPA routing would be broken.

  Internally, useNavigate's context provider `goto` checks the new destination with the last route location. If the
  origin is different, it just does a normal browser navigation. This makes sense; links to other origins cannot use
  SPA routing. However, the initial route it compares was using an origin that came from the server environment.

  Now, the first navigation will set that initial route to the browser's actual href, eliminating the erroneous
  origin mismatch for SPA navigations.

- 🐞🩹 `this` in various Qwik-City handlers is now `RequestEvent` again. (by [@wmertens](https://github.com/wmertens) in [#8111](https://github.com/QwikDev/qwik/pull/8111))

## 1.17.1

### Patch Changes

- 🐞🩹 `zod` is now imported as `import * as z from 'zod'`, which vastly improves bundling. The Insights app client code reduced by 12kB. (by [@wmertens](https://github.com/wmertens) in [#8042](https://github.com/QwikDev/qwik/pull/8042))

## 1.17.0

### Patch Changes

- 🐞🩹 SSG sometimes hangs after completion, now we forcibly exit the SSG process when this happens. (by [@wmertens](https://github.com/wmertens) in [#7957](https://github.com/QwikDev/qwik/pull/7957))

- 🐞🩹 return 404 for missing /build/ files. (by [@gioboa](https://github.com/gioboa) in [#7914](https://github.com/QwikDev/qwik/pull/7914))

- 🐞🩹 redirecting internal q-data.json requests will keep the q-data.json suffix so that the client can still fetch the correct one (by [@wmertens](https://github.com/wmertens) in [#7988](https://github.com/QwikDev/qwik/pull/7988))

- 🐞🩹 solve type error when using async \_resolved function (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7426](https://github.com/QwikDev/qwik/pull/7426))

- 🐞🩹 while prefetching Link data, don't navigate to captive portals (by [@wmertens](https://github.com/wmertens) in [#7988](https://github.com/QwikDev/qwik/pull/7988))

## 1.16.1

### Patch Changes

- 🐞🩹 fix behaviour of checkOrigin: "lax-proto" in createQwikCity (by [@asaharan](https://github.com/asaharan) in [#7865](https://github.com/QwikDev/qwik/pull/7865))

- 🛠 Add check-client command to verify bundle freshness (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7517](https://github.com/QwikDev/qwik/pull/7517))

- 🐞🩹 return 404 with invalid URL. (by [@gioboa](https://github.com/gioboa) in [#7902](https://github.com/QwikDev/qwik/pull/7902))

- ✨ All qwik packages are now marked as side effect free in their package.json. This should remove a few unecessary empty imports added by rollup and then not tree-shaken like `import "./preloader.js"`. (by [@maiieul](https://github.com/maiieul) in [#7908](https://github.com/QwikDev/qwik/pull/7908))

- ✨ SPA Link navigation now preloads the next route bundles on click with maximum probability, speeding up SPA navigation. (by [@maiieul](https://github.com/maiieul) in [#7849](https://github.com/QwikDev/qwik/pull/7849))

- 🐞🩹 Your service-worker.js won't be unregistered anymore if you added custom logic to it. (by [@maiieul](https://github.com/maiieul) in [#7872](https://github.com/QwikDev/qwik/pull/7872))

  > Note: Qwik 1.14.0 and above now use `<link rel="modulepreload">` by default. If you didn't add custom service-worker logic, you should remove your service-worker.ts file(s) for the `ServiceWorkerRegister` Component to actually unregister the service-worker.js and delete its related cache. Make sure to keep the `ServiceWorkerRegister` Component in your app (without any service-worker.ts file) as long as you want to unregister the service-worker.js for your users.

## 1.16.0

### Minor Changes

- ✨ bump Vite to v7 (by [@gioboa](https://github.com/gioboa) in [#7762](https://github.com/QwikDev/qwik/pull/7762))

### Patch Changes

- 🐞🩹 Keeping the service worker components now properly unregisters them. (by [@maiieul](https://github.com/maiieul) in [#7781](https://github.com/QwikDev/qwik/pull/7781))

- 🐞🩹 redirects no longer take their parent layout's Cache-Control value by default and are instead set to `no-store`. This prevents issues in redirection logic. We might introduce another API to enable caching redirects in the future. (by [@maiieul](https://github.com/maiieul) in [#7811](https://github.com/QwikDev/qwik/pull/7811))

- 🐞🩹 Keeping the service worker components now also removes their associated Cache storage. (by [@maiieul](https://github.com/maiieul) in [#7782](https://github.com/QwikDev/qwik/pull/7782))

## 1.15.0

### Minor Changes

- ✨ Added rewrite() to the RequestEvent object. It works like redirect but does not change the URL, (by [@omerman](https://github.com/omerman) in [#7562](https://github.com/QwikDev/qwik/pull/7562))
  think of it as an internal redirect.

  Example usage:

  ```ts
  export const onRequest: RequestHandler = async ({ url, rewrite }) => {
    if (url.pathname.includes('/articles/the-best-article-in-the-world')) {
      const artistId = db.getArticleByName('the-best-article-in-the-world');

      // Url will remain /articles/the-best-article-in-the-world, but under the hood,
      // will render /articles/${artistId}
      throw rewrite(`/articles/${artistId}`);
    }
  };
  ```

### Patch Changes

- 🐞🩹 Change Content-Type header in qwik requests to respect RFC 7231 (by [@joaomaridalho](https://github.com/joaomaridalho) in [#7690](https://github.com/QwikDev/qwik/pull/7690))

- 🐞🩹 link/useNavigate with query params don't override loader/middleware redirect with query params anymore. (by [@maiieul](https://github.com/maiieul) in [#7733](https://github.com/QwikDev/qwik/pull/7733))

- 🐞🩹 allow cross-protocol requests from the same domain (by [@gioboa](https://github.com/gioboa) in [#7693](https://github.com/QwikDev/qwik/pull/7693))

- 🛠 update devDependencies and configurations (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7695](https://github.com/QwikDev/qwik/pull/7695))

- 🐞🩹 Duplicate ServerError class during dev mode (by [@wmertens](https://github.com/wmertens) in [#7724](https://github.com/QwikDev/qwik/pull/7724))

## 1.14.1

## 1.14.0

### Minor Changes

- 🐞🩹 qwik-city no longer forces `q-data.json` downloads, instead relying on the cache headers. This means that you have to make sure your `q-data.json` is served with `Cache-Control` headers that suit you. That file contains all the information about the route and is read for each qwik-city navigation. By default the data is cached for one hour. (by [@wmertens](https://github.com/wmertens) in [#7537](https://github.com/QwikDev/qwik/pull/7537))

- 🛠 the service workers have been deprecated and replaced with entries that unregister them. If you have it enabled in production, you can remove it after a while once you are sure all your users have the new version. (by [@wmertens](https://github.com/wmertens) in [#7453](https://github.com/QwikDev/qwik/pull/7453))

### Patch Changes

- 🐞🩹 linting errors which were previously being ignored across the monorepo. (by [@better-salmon](https://github.com/better-salmon) in [#7418](https://github.com/QwikDev/qwik/pull/7418))

- 🐞🩹 Link SPA subsequent navigation now properly prefetch the next routes. (by [@maiieul](https://github.com/maiieul) in [#7590](https://github.com/QwikDev/qwik/pull/7590))

- 🐞🩹 SPA Link now handle subsequent onQVisible$ passed as props. (by [@maiieul](https://github.com/maiieul) in [#7612](https://github.com/QwikDev/qwik/pull/7612))

## 1.13.0

### Minor Changes

- 🐞🩹 server$ errors can be caught by @plugin middleware (by [@DustinJSilk](https://github.com/DustinJSilk) in [#7185](https://github.com/QwikDev/qwik/pull/7185))

- refactor: Error types are standardised across server$ functions and routeLoaders (by [@DustinJSilk](https://github.com/DustinJSilk) in [#7185](https://github.com/QwikDev/qwik/pull/7185))

- ✨ 499 is now a valid status code (by [@DustinJSilk](https://github.com/DustinJSilk) in [#7185](https://github.com/QwikDev/qwik/pull/7185))

- 🐞🩹 server$ functions now correctly throw 4xx errors on the client (by [@DustinJSilk](https://github.com/DustinJSilk) in [#7185](https://github.com/QwikDev/qwik/pull/7185))

### Patch Changes

- 🐞🩹 Error boundary `ErrorBoundary` and fix `useErrorBoundary` (by [@damianpumar](https://github.com/damianpumar) in [#7342](https://github.com/QwikDev/qwik/pull/7342))

- 🐞🩹 Write Response object in the send request event even on redirects (by [@nelsonprsousa](https://github.com/nelsonprsousa) in [#7422](https://github.com/QwikDev/qwik/pull/7422))

## 1.12.1

### Patch Changes

- 🐞🩹 MDX content now accepts a prop of type `components` that lets you use your own custom components (by [@double-thinker](https://github.com/double-thinker) in [#7277](https://github.com/QwikDev/qwik/pull/7277))

  To add custom components to your MDX content, you can now do this:

  ```tsx
  // routes/example/index.tsx
  import Content from './markdown.mdx';
  import MyComponent from '../../components/my-component/my-component';
  import { component$ } from '@builder.io/qwik';

  export default component$(() => <Content components={{ MyComponent }} />);
  ```

  You can also use props in JS expressions. See https://mdxjs.com/docs/using-mdx/#props

- 🐞🩹 mdx not rendering (by [@shairez](https://github.com/shairez) in [#7168](https://github.com/QwikDev/qwik/pull/7168))

- 📃 added a "Qwik for Mobile" guide to build iOS and Android Qwik apps (by [@srapport](https://github.com/srapport) in [#7205](https://github.com/QwikDev/qwik/pull/7205))

- 🐞🩹 some qrls weren't fetched correctly on page load (by [@shairez](https://github.com/shairez) in [#7286](https://github.com/QwikDev/qwik/pull/7286))

## 1.12.0

### Patch Changes

- 🐞🩹 the previous URL now is undefined on first render. (by [@damianpumar](https://github.com/damianpumar) in [#7082](https://github.com/QwikDev/qwik/pull/7082))

- 🐞🩹 server$ functions now correctly throw errors for > 500 error codes (by [@DustinJSilk](https://github.com/DustinJSilk) in [#7078](https://github.com/QwikDev/qwik/pull/7078))

## 1.11.0

## 1.10.0

### Patch Changes

- 🐞🩹 MDX content no longer ignores Layout components. See [the MDX docs](https://mdxjs.com/docs/using-mdx/#layout) for more information. (by [@danielvaijk](https://github.com/danielvaijk) in [#6845](https://github.com/QwikDev/qwik/pull/6845))

- 🐞🩹 SSG errors now show the path that failed (by [@wmertens](https://github.com/wmertens) in [#6998](https://github.com/QwikDev/qwik/pull/6998))

- 🐞🩹 Fixed action redirect regression where searchParams were appended (by [@brandonpittman](https://github.com/brandonpittman) in [#6927](https://github.com/QwikDev/qwik/pull/6927))

- 🐞🩹 Redirect, error, and fail request events no longer forcefully delete user-defined Cache-Control HTTP header value. (by [@nelsonprsousa](https://github.com/nelsonprsousa) in [#6991](https://github.com/QwikDev/qwik/pull/6991))

- 🐞🩹 `vite` is now a peer dependency of `qwik`, `qwik-city`, `qwik-react` and `qwik-labs`, so that there can be no duplicate imports. This should not have consequences, since all apps also directly depend on `vite`. (by [@wmertens](https://github.com/wmertens) in [#6945](https://github.com/QwikDev/qwik/pull/6945))

- 🐞🩹 Fixed MDX layout default export being ignored by transformer. (by [@danielvaijk](https://github.com/danielvaijk) in [#6845](https://github.com/QwikDev/qwik/pull/6845))

- 🐞🩹 Prevent unexpected caching for q-data.json (by [@genki](https://github.com/genki) in [#6808](https://github.com/QwikDev/qwik/pull/6808))

- 🐞🩹 Multiple rewrite routes pointing to the same route is no longer an error. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6970](https://github.com/QwikDev/qwik/pull/6970))

## 1.9.1

### Patch Changes

- ✨ Experimental feature - `noSPA`. (by [@wmertens](https://github.com/wmertens) in [#6937](https://github.com/QwikDev/qwik/pull/6937))
  This disables history patching, slightly reducing code size and startup time. Use this when your application is MPA only, meaning you don't use the Link component. To enable this, add it to the `experimental` array of the `qwikVite` plugin (not the `qwikCity` plugin).

## 1.9.0

### Minor Changes

- ✨ **(EXPERIMENTAL)** valibot$ validator and a fix for zod$ types. (by [@fabian-hiller](https://github.com/fabian-hiller) in [#6752](https://github.com/QwikDev/qwik/pull/6752))

  To use it, you need to pass `experimental: ['valibot']` as an option to the `qwikVite` plugin as such:

  ```ts
  // vite.config.ts

  export default defineConfig(({ command, mode }): UserConfig => {
    return {
      plugins: [
        // ... other plugins like qwikCity() etc
        qwikVite({
          experimental: ['valibot']
          // ... other options
        }),

      ],
      // ... rest of the config
    };
  }

  ```

- ✨ **(EXPERIMENTAL)** `usePreventNavigate` lets you prevent navigation while your app's state is unsaved. It works asynchronously for SPA navigation and falls back to the browser's default dialogs for other navigations. To use it, add `experimental: ['preventNavigate']` to your `qwikVite` options. (by [@wmertens](https://github.com/wmertens) in [#6825](https://github.com/QwikDev/qwik/pull/6825))

### Patch Changes

- 🐞🩹 added .ico to be detected by isStaticFile (by [@intellix](https://github.com/intellix) in [#6860](https://github.com/QwikDev/qwik/pull/6860))

- 🐞🩹 fixed delays caused from inefficient Service Worker prefetching (buffering) (by [@shairez](https://github.com/shairez) in [#6863](https://github.com/QwikDev/qwik/pull/6863))

## 1.8.0

## 1.7.3

## 1.7.2

### Patch Changes

- - built files are now under dist/ or lib/. All tools that respect package export maps should just work. (by [@wmertens](https://github.com/wmertens) in [#6715](https://github.com/QwikDev/qwik/pull/6715))
    If you have trouble with Typescript, ensure that you use `moduleResolution: "Bundler"` in your `tsconfig.json`.
  - `@qwik.dev/core` no longer depends on `undici`

- During dev mode, qwik-city will no longer serve files from `dist/`, which are very likely to be stale/incorrect. Furthermore, query parameters are taken into account when serving files (like production servers would do). (by [@wmertens](https://github.com/wmertens) in [#6694](https://github.com/QwikDev/qwik/pull/6694))

- qwik-city is now more careful about redirects after requesting routeLoader data (by [@wmertens](https://github.com/wmertens) in [#6740](https://github.com/QwikDev/qwik/pull/6740))

- strip internal search parameters in canonical URLs (by [@wmertens](https://github.com/wmertens) in [#6694](https://github.com/QwikDev/qwik/pull/6694))

- Support entry.ts routes in dev mode now that dist/ is no longer served, and special-case `repl-sw.js` in the docs. (by [@wmertens](https://github.com/wmertens) in [#6706](https://github.com/QwikDev/qwik/pull/6706))
