# @builder.io/qwik-city

## 1.9.2

### Patch Changes

- Fix action redirect regression where searchParams were appended (by [@brandonpittman](https://github.com/brandonpittman) in [#6927](https://github.com/QwikDev/qwik/pull/6927))

- Prevent unexpected caching for q-data.json (by [@genki](https://github.com/genki) in [#6808](https://github.com/QwikDev/qwik/pull/6808))

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
