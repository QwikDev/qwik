# @builder.io/qwik

## 1.13.0

### Minor Changes

- The `useTask# @builder.io/qwik function's `eagerness` option is deprecated and will be removed in version 2. (by [@sreeisalso](https://github.com/sreeisalso) in [#7345](https://github.com/QwikDev/qwik/pull/7345))

### Patch Changes

- 🐞🩹 Error boundary `ErrorBoundary` and fix `useErrorBoundary` (by [@damianpumar](https://github.com/damianpumar) in [#7342](https://github.com/QwikDev/qwik/pull/7342))

- 🐞 🩹 The qwik-city ServiceWorkerRegister and qwik PrefetchServiceWorker now prefetch all their qrls to prevent under-prefetching (by [@maiieul](https://github.com/maiieul) in [#7417](https://github.com/QwikDev/qwik/pull/7417))

- 🐞🩹 When csr is true, it causes a crash because resolve cannot be null as the second parameter (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7420](https://github.com/QwikDev/qwik/pull/7420))

- updated drizzle to latest version (by [@sreeisalso](https://github.com/sreeisalso) in [#7288](https://github.com/QwikDev/qwik/pull/7288))

- 🐞 fix(rollup): improve manualChunks logic to minimize over-prefetching (by [@maiieul](https://github.com/maiieul) in [#7362](https://github.com/QwikDev/qwik/pull/7362))

- ✨ Add the ability to see chunks names in preview/production environments to facilitate debugging of production-only bugs (by [@maiieul](https://github.com/maiieul) in [#7293](https://github.com/QwikDev/qwik/pull/7293))

- Emit an CustomEvent `qviewTransition` when view transition starts. (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#7237](https://github.com/QwikDev/qwik/pull/7237))

- ✨ Ability to keep using tailwind v3 through the cli (by [@maiieul](https://github.com/maiieul) in [#7403](https://github.com/QwikDev/qwik/pull/7403))

- dev server now correctly handles css and js importers, also hmr persistence (by [@thejackshelton](https://github.com/thejackshelton) in [#7389](https://github.com/QwikDev/qwik/pull/7389))

- 🐞🩹 set default value of lint to false to improve the execution performance (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7425](https://github.com/QwikDev/qwik/pull/7425))

- 🐞🩹 manual QRL grouping now works again. This is needed for Insights to work. (by [@wmertens](https://github.com/wmertens) in [#7444](https://github.com/QwikDev/qwik/pull/7444))

## 1.12.1

### Patch Changes

- 📃 update turso integration keywords, add contributor (by [@A2-NieR](https://github.com/A2-NieR) in [#7215](https://github.com/QwikDev/qwik/pull/7215))

- ✨ tailwindcss v4 integration (by [@sreeisalso](https://github.com/sreeisalso) in [#7274](https://github.com/QwikDev/qwik/pull/7274))

- 🐞🩹 remove usage of `computedStyleMap` (by [@Varixo](https://github.com/Varixo) in [#7252](https://github.com/QwikDev/qwik/pull/7252))

- 📃 remove shop (by [@gioboa](https://github.com/gioboa) in [#7221](https://github.com/QwikDev/qwik/pull/7221))

- 🐞🩹 error in the middleware occurs 404 (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6951](https://github.com/QwikDev/qwik/pull/6951))

- 🐞🩹 changed turso createClient import to work with file urls, updated docs note with info & link to the corresponding section in the turso docs (by [@A2-NieR](https://github.com/A2-NieR) in [#7211](https://github.com/QwikDev/qwik/pull/7211))

- 📃 add Qwik blog + articles (by [@gioboa](https://github.com/gioboa) in [#7214](https://github.com/QwikDev/qwik/pull/7214))

- 🐞🩹 input's value is string when passing number (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7249](https://github.com/QwikDev/qwik/pull/7249))

## 1.12.0

### Minor Changes

- ✨ The build constants `isDev`, `isBrowser` and `isServer` are now exported from `@builder.io/qwik` directly, so they are more discoverable and easier to add. `@builder.io/qwik/build` still remains. (by [@wmertens](https://github.com/wmertens) in [#7138](https://github.com/QwikDev/qwik/pull/7138))

### Patch Changes

- 🐞🩹 add subscription when doing `"prop" in store` (by [@revintec](https://github.com/revintec) in [#7071](https://github.com/QwikDev/qwik/pull/7071))

- 🐞🩹 `stoppropagation` functionality (by [@shairez](https://github.com/shairez) in [#7102](https://github.com/QwikDev/qwik/pull/7102))

## 1.11.0

### Minor Changes

- CHORE: Prepare backwards compatibility for V1 libraries in V2. (by [@wmertens](https://github.com/wmertens) in [#7044](https://github.com/QwikDev/qwik/pull/7044))

  We move internal fields `immutableProps` and `flags` out of JSXNode as they are not meant for public use.

  This will allow projects using older V1 libraries to continue to work with the Qwik V2 by adding the following `package.json` changes:

  ```json
  {
    "dependencies": {
      "@builder.io/qwik": "^1.11.0",
      "@qwik.dev/core": "^2.0.0"
    }
  }
  ```

  And will prevent typescript errors when using libraries which haven't upgraded to V2 yet.

- ✨ add monorepo support to the `qwik add` command by adding a `projectDir` param (by [@shairez](https://github.com/shairez) in [#7059](https://github.com/QwikDev/qwik/pull/7059))

  That way you can run `qwik add --projectDir=packages/my-package` and it will add the feature to the specified project/package (sub) folder, instead of the root folder.

## 1.10.0

### Minor Changes

- Async functions in `useComputed` are deprecated. (by [@wmertens](https://github.com/wmertens) in [#7013](https://github.com/QwikDev/qwik/pull/7013))

  **Why?**

  - Qwik can't track used signals after the first await, which leads to subtle bugs.
  - When calculating the first time, it will see it's a promise and it will restart the render function.
  - Both `useTask` and `useResource` are available, without these problems.

  In v2, async functions won't work.

  Again, to get the same functionality use `useTask` or `useResource` instead, or this function:

  ```tsx
  export const useAsyncComputed$ = (qrlFn: QRL<() => Promise<any>>) => {
    const sig = useSignal();
    useTask(({ track }) => {
      const result = track(qrlFn);
      if (result && 'then' in result) {
        result.then(
          (val) => (sig.value = val),
          (err) => {
            console.error('async computed function threw!', err);
            throw error;
          }
        );
      } else {
        sig.value = result;
      }
    });
    return sig;
  };
  ```

- ✨ Expose `unwrapStore` as a low level AP (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#6960](https://github.com/QwikDev/qwik/pull/6960))

  This enables developers to clone the content of a `useStore()` using `structureClone` or IndexedDB

### Patch Changes

- 📃 fix useResource docs example & remove unused demo (by [@ianlet](https://github.com/ianlet) in [#6893](https://github.com/QwikDev/qwik/pull/6893))

- 🐞🩹 QRL segment filenames are no longer lowercased. This was giving trouble with parent lookups in dev mode and there was no good reason for it. (by [@wmertens](https://github.com/wmertens) in [#7003](https://github.com/QwikDev/qwik/pull/7003))

- 🐞🩹 the type for `<textarea>` now accepts text children, as per spec. (by [@wmertens](https://github.com/wmertens) in [#7016](https://github.com/QwikDev/qwik/pull/7016))

- 🐞🩹 dev-mode QRL paths are now handled by Vite so they are the same as the parent paths. You can see this in the Sources section of the browser devtools, where the segments are now always next to their parents (when the parent is loaded). (by [@wmertens](https://github.com/wmertens) in [#7037](https://github.com/QwikDev/qwik/pull/7037))

- 🐞🩹 `vite` is now a peer dependency of `qwik`, `qwik-city`, `qwik-react` and `qwik-labs`, so that there can be no duplicate imports. This should not have consequences, since all apps also directly depend on `vite`. (by [@wmertens](https://github.com/wmertens) in [#6945](https://github.com/QwikDev/qwik/pull/6945))

- ✨ sync$ QRLs will now be serialized into the HTML in a shorter form (by [@wmertens](https://github.com/wmertens) in [#6944](https://github.com/QwikDev/qwik/pull/6944))

- 🐞🩹 cli build command appearing to "hang" on errors (by [@shairez](https://github.com/shairez) in [#6943](https://github.com/QwikDev/qwik/pull/6943))

- ✨ Allow setting `linkFetchPriority` for modulepreload links in the prefetch strategy. Also fix the links in dev mode (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#6947](https://github.com/QwikDev/qwik/pull/6947))

## 1.9.1

### Patch Changes

- ✨ showing qrl parent names. (by [@wmertens](https://github.com/wmertens) in [#6881](https://github.com/QwikDev/qwik/pull/6881))
  in dev mode, qrl segments now start with their parent filename so it's easy to see where they came from. Furthermore, in production builds these filenames are also used so that origins in `q-manifest.json` are easy to understand.

- 🐞🩹 Optimizer now ignores unknown deps in graph that caused crashes during build (by [@wmertens](https://github.com/wmertens) in [#6888](https://github.com/QwikDev/qwik/pull/6888))

- 🐞🩹 Do not allow object methods to be serialized with style prop (by [@jakovljevic-mladen](https://github.com/jakovljevic-mladen) in [#6932](https://github.com/QwikDev/qwik/pull/6932))

- 🐞🩹 In dev mode, changes to QRLs now explicitly invalidate the segment so that the browser will reload it (by [@wmertens](https://github.com/wmertens) in [#6938](https://github.com/QwikDev/qwik/pull/6938))

## 1.9.0

### Patch Changes

- ✨ Introducing the `experimental[]` option to the Vite plugin. This allows you to opt in to features that are not guaranteed to have a stable API. (by [@wmertens](https://github.com/wmertens) in [#6880](https://github.com/QwikDev/qwik/pull/6880))

- 🐞🩹 fix typo in using useStore() (by [@zaynet](https://github.com/zaynet) in [#6875](https://github.com/QwikDev/qwik/pull/6875))

- 🐞🩹 gracefully handle image dimensions service errors (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6855](https://github.com/QwikDev/qwik/pull/6855))

- ✨ Lib builds no longer perform qwik transformation. (by [@wmertens](https://github.com/wmertens) in [#6850](https://github.com/QwikDev/qwik/pull/6850))

  This prevents using unstable internal APIs, and doesn't make a difference for the end user. Library authors are strongly urged to push a new library patch version built with this qwik version, and to add `| ^2.0.0` to their accepted qwik version range.

- 🐞🩹 SSG Link component strips search parameters (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6778](https://github.com/QwikDev/qwik/pull/6778))

- 🐞🩹 The PrefetchServiceWorker now has a more efficient graph and only prefetches direct imports and, at a lower priority, task QRL segments. This greatly improves its load performance. (by [@wmertens](https://github.com/wmertens) in [#6853](https://github.com/QwikDev/qwik/pull/6853))

## 1.8.0

### Minor Changes

- Updated SWC parser means that the optimizer now understands `import ... with` syntax and that enums are replaced with numbers where possible. (by [@wmertens](https://github.com/wmertens) in [#6005](https://github.com/QwikDev/qwik/pull/6005))

- The optimizer plugin will now rely on Rollup to group QRL segments. It will only provide hints on which segments fit well together. The result of this change is that now code splitting happens during the transform phase only, and other Rollup/Vite plugins (such as css-in-js plugins) can transform the code before Qwik transforms it. (by [@wmertens](https://github.com/wmertens) in [#6670](https://github.com/QwikDev/qwik/pull/6670))

- The default asset filenames in the build have changed. Now they are under `assets/hash-name.ext`, so they are clearly separated from code. (by [@wmertens](https://github.com/wmertens) in [#5745](https://github.com/QwikDev/qwik/pull/5745))

### Patch Changes

- The `fileFilter` option to `qwikVite()` now always allows `*.qwik.{m,c,}js` files so that QRLs in libraries can be processed. (by [@wmertens](https://github.com/wmertens) in [#6760](https://github.com/QwikDev/qwik/pull/6760))

## 1.7.3

## 1.7.2

### Patch Changes

- Library builds now correctly generate \_fnSignal calls again. Any Qwik library that exports components should be built again. (by [@wmertens](https://github.com/wmertens) in [#6732](https://github.com/QwikDev/qwik/pull/6732))

- - built files are now under dist/ or lib/. All tools that respect package export maps should just work. (by [@wmertens](https://github.com/wmertens) in [#6715](https://github.com/QwikDev/qwik/pull/6715))
    If you have trouble with Typescript, ensure that you use `moduleResolution: "Bundler"` in your `tsconfig.json`.
  - `@builder.io/qwik` no longer depends on `undici`

- fix dev mode on windows (by [@Varixo](https://github.com/Varixo) in [#6713](https://github.com/QwikDev/qwik/pull/6713))
