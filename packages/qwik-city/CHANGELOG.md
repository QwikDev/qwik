# @builder.io/qwik-city

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
  - `@builder.io/qwik` no longer depends on `undici`

- During dev mode, qwik-city will no longer serve files from `dist/`, which are very likely to be stale/incorrect. Furthermore, query parameters are taken into account when serving files (like production servers would do). (by [@wmertens](https://github.com/wmertens) in [#6694](https://github.com/QwikDev/qwik/pull/6694))

- qwik-city is now more careful about redirects after requesting routeLoader data (by [@wmertens](https://github.com/wmertens) in [#6740](https://github.com/QwikDev/qwik/pull/6740))

- strip internal search parameters in canonical URLs (by [@wmertens](https://github.com/wmertens) in [#6694](https://github.com/QwikDev/qwik/pull/6694))

- Support entry.ts routes in dev mode now that dist/ is no longer served, and special-case `repl-sw.js` in the docs. (by [@wmertens](https://github.com/wmertens) in [#6706](https://github.com/QwikDev/qwik/pull/6706))
