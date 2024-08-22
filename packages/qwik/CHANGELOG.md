# @builder.io/qwik

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
