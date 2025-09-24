# create-qwik

## 1.16.1

### Patch Changes

- 🐞🩹 set sideEffects: false to the lib template, otherwise there might be some side effects imports when building a consumer project. (by [@gioboa](https://github.com/gioboa) in [#7855](https://github.com/QwikDev/qwik/pull/7855))

- 🐞🩹 fix up vscode settings merge. Use JSON5 to parse settings.json to prevent parsing errors. (by [@gioboa](https://github.com/gioboa) in [#7858](https://github.com/QwikDev/qwik/pull/7858))

- 🛠 use the new version of @croct/json5-parser to merge JSON5 and preserve comments (by [@gioboa](https://github.com/gioboa) in [#7884](https://github.com/QwikDev/qwik/pull/7884))

## 1.16.0

### Minor Changes

- ✨ bump Vite to v7 (by [@gioboa](https://github.com/gioboa) in [#7762](https://github.com/QwikDev/qwik/pull/7762))

### Patch Changes

- 🐞🩹 fix up TypeScript compatibility in the localize starter (by [@FDiskas](https://github.com/FDiskas) in [#7617](https://github.com/QwikDev/qwik/pull/7617))

## 1.15.0

### Patch Changes

- 🐞🩹 fix up vercel starter config (by [@cmbartschat](https://github.com/cmbartschat) in [#7663](https://github.com/QwikDev/qwik/pull/7663))

- 🛠 update devDependencies and configurations (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7695](https://github.com/QwikDev/qwik/pull/7695))

## 1.14.1

### Patch Changes

- 🐞🩹 starter app missing package and added preview cli test (by [@wmertens](https://github.com/wmertens) in [#7626](https://github.com/QwikDev/qwik/pull/7626))

## 1.14.0

### Patch Changes

- 🐞🩹 create-qwik logAppCreated.ts now displays correct next steps for deno. (by [@LogProphet](https://github.com/LogProphet) in [#7566](https://github.com/QwikDev/qwik/pull/7566))

  After using the create-qwik command, the logAppCreated.ts file was not displaying the correct next steps for deno. Prior to this fix it would display "deno start" instead of "deno task start". This would cause a failure to run, as deno requires the 'task' keyword. This fixes bug 7520

- 🐞🩹 linting errors which were previously being ignored across the monorepo. (by [@better-salmon](https://github.com/better-salmon) in [#7418](https://github.com/QwikDev/qwik/pull/7418))

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
