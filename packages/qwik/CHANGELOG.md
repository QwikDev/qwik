# @builder.io/qwik

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
