# @builder.io/qwik-city

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
