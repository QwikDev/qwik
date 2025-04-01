# create-qwik

## 1.13.0

## 1.12.1

## 1.12.0

## 1.11.0

## 1.10.0

### Patch Changes

- INFRA: migration from tsm to tsx (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6877](https://github.com/QwikDev/qwik/pull/6877))

## 1.9.1

## 1.9.0

### Patch Changes

- ✨ tailwind starter dependencies upgraded to latest (by [@thejackshelton](https://github.com/thejackshelton) in [#6783](https://github.com/QwikDev/qwik/pull/6783))

- ✨ added `preserveModules` to library starters to improve library bundling / tree-shaking (by [@thejackshelton](https://github.com/thejackshelton) in [#6773](https://github.com/QwikDev/qwik/pull/6773))

## 1.8.0

### Patch Changes

- 🐞🩹 wrong version when creating a library (by [@shairez](https://github.com/shairez) in [#6757](https://github.com/QwikDev/qwik/pull/6757))

## 1.7.3

### Patch Changes

- 🐞🩹 get the right version number in starter apps (by [@shairez](https://github.com/shairez) in [#6742](https://github.com/QwikDev/qwik/pull/6742))

## 1.7.2

### Patch Changes

- - built files are now under dist/ or lib/. All tools that respect package export maps should just work. (by [@wmertens](https://github.com/wmertens) in [#6715](https://github.com/QwikDev/qwik/pull/6715))
    If you have trouble with Typescript, ensure that you use `moduleResolution: "Bundler"` in your `tsconfig.json`.
  - `@builder.io/qwik` no longer depends on `undici`
