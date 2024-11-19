# @qwik.dev/core

## 2.0.0-alpha.1

### Patch Changes

- 🐞🩹 reduced number of errors "Cannot serialize function" during serialization (by [@Varixo](https://github.com/Varixo) in [#7066](https://github.com/QwikDev/qwik/pull/7066))

## 2.0.0-alpha.0

### Major Changes

- BREAKING: remove HTML-related types. Use PropsOf instead. (by [@wmertens](https://github.com/wmertens) in [#7045](https://github.com/QwikDev/qwik/pull/7045))

- 💥**BREAKING**: `useComputed` no longer allows Promise returns. (meaning it is strictly sync) Instead, use `useSignal` and `useTask` together to perform async signal updates (by [@wmertens](https://github.com/wmertens) in [#6907](https://github.com/QwikDev/qwik/pull/6907))

- `qwik-labs` package has been removed in favor of experimental features. (by [@shairez](https://github.com/shairez) in [#7025](https://github.com/QwikDev/qwik/pull/7025))
  So the "Insights" vite plugin and components have been moved to core as an experimental feature.

  In order to use it, you need to -

  **1)** add `insights` to the experimental array in `vite.config.ts`:

  ```ts
  qwikVite({
    experimental: ['insights']
  }),
  ```

  **2)** Import and use the `qwikInsights` vite plugin from `@qwik.dev/core/insights/vite`:

  ```ts
  import { qwikInsights } from '@qwik.dev/core/insights/vite';
  ```

  **3)** import the `<Insights>` component from `@qwik.dev/core/insights` and use it in your `root.tsx` file: :

  ```tsx title="root.tsx"
  import { Insights } from '@qwik.dev/core/insights';

  // ...rest of root.tsx file

  return (
    <Insights publicApiKey="..." postUrl="..." />
    /* ...qwik app */
  );
  ```

- BREAKING: the Typescript exports were trimmed down to the bare minimum. If there are types you are missing, open an issue. (by [@wmertens](https://github.com/wmertens) in [#7045](https://github.com/QwikDev/qwik/pull/7045))

### Minor Changes

- ✨ new integration tests that are running with the optimizer (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ new simpler signals implementation with lazy useComputed$ execution, only when is needed (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ added the scheduler to sort chores execution and have more predictable behavior (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ new faster serialization system (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ new CSR and SSR rendering written from scratch to speed up performance, improve code readability, and make the code easier to understand for new contributors (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

### Patch Changes

- 🐞🩹 do not trigger effects if computed value is not changed (by [@Varixo](https://github.com/Varixo) in [#6996](https://github.com/QwikDev/qwik/pull/6996))

## 1.9.1

### Patch Changes

- ✨ showing qrl parent names. (by [@wmertens](https://github.com/wmertens) in [#6881](https://github.com/QwikDev/qwik/pull/6881))
  in dev mode, qrl segments now start with their parent filename so it's easy to see where they came from. Furthermore, in production builds these filenames are also used so that origins in `q-manifest.json` are easy to understand.

- 🐞🩹 Optimizer now ignores unknown deps in graph that caused crashes during build (by [@wmertens](https://github.com/wmertens) in [#6888](https://github.com/QwikDev/qwik/pull/6888))

- 🐞🩹 Do not allow object methods to be serialized with style prop (by [@jakovljevic-mladen](https://github.com/jakovljevic-mladen) in [#6932](https://github.com/QwikDev/qwik/pull/6932))

- 🐞🩹 In dev mode, changes to QRLs now explicitly invalidate the segment so that the browser will reload it (by [@wmertens](https://github.com/wmertens) in [#6938](https://github.com/QwikDev/qwik/pull/6938))

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
  - `@qwik.dev/core` no longer depends on `undici`

- fix dev mode on windows (by [@Varixo](https://github.com/Varixo) in [#6713](https://github.com/QwikDev/qwik/pull/6713))
