# @qwik.dev/city

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
  // vite.config.mts

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
