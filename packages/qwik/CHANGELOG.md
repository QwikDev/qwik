# @qwik.dev/core

## 2.0.0-beta.28

### Minor Changes

- ✨ the Vite environment API is now better supported. This means that you can build multiple environments simultaneously without Qwik having a problem, with `vite build --app`. (by [@wmertens](https://github.com/wmertens) in [#6903](https://github.com/QwikDev/qwik/pull/6903))

  However, Qwik Router adapters still require running `build.server` separately for now because they use a different vite configuration file.

  The minimum supported version of Vite is now 6.0.0.

- ✨ Hot Module Replacement (HMR) support. You now get instant updates in the browser when you change your source code, without losing state. This happens without forcing a resume at load, so everything is fast. (by [@wmertens](https://github.com/wmertens) in [#8421](https://github.com/QwikDev/qwik/pull/8421))
  The slight disadvantage is that all components now send their state during development (because now they can always rerender on the client). You can disable HMR and fall back to full page reloads by setting `{devTools: {hmr: false}}` in the `qwikVite()` plugin configuration.

## 2.0.0-beta.27

### Minor Changes

- ✨ The optimizer now hoists QRLs without captures to the module scope. This means that only one instance of the QRL will be created. (by [@wmertens](https://github.com/wmertens) in [#8388](https://github.com/QwikDev/qwik/pull/8388))

- ✨ The optimizer will now extract captures from QRL event handlers and move them to their string tag. This allows moving the QRL to the module scope, giving better performance. (by [@wmertens](https://github.com/wmertens) in [#8388](https://github.com/QwikDev/qwik/pull/8388))

- ✨ The optimizer can now handle self-references. This means that e.g. an `AsyncSignal` can write to itself. (by [@wmertens](https://github.com/wmertens) in [#8388](https://github.com/QwikDev/qwik/pull/8388))

## 2.0.0-beta.26

### Patch Changes

- 🐞🩹 slotted text should not disappear when conditional content before `<Slot />` is toggled off (by [@Varixo](https://github.com/Varixo) in [#8396](https://github.com/QwikDev/qwik/pull/8396))

- 🐞🩹 ignore event calls for already removed elements (by [@Varixo](https://github.com/Varixo) in [#8396](https://github.com/QwikDev/qwik/pull/8396))

- 🐞🩹 crashing or hanging browser while handling projections changes (by [@Varixo](https://github.com/Varixo) in [#8396](https://github.com/QwikDev/qwik/pull/8396))

- 🐞🩹 component should not rerender with constant null or undefined key (by [@Varixo](https://github.com/Varixo) in [#8396](https://github.com/QwikDev/qwik/pull/8396))

## 2.0.0-beta.25

### Minor Changes

- ✨ serialized state should be up to 30% smaller (by [@Varixo](https://github.com/Varixo) in [#8375](https://github.com/QwikDev/qwik/pull/8375))

### Patch Changes

- 🐞🩹 event calls for disconnected elements should be ignored (by [@Varixo](https://github.com/Varixo) in [#8383](https://github.com/QwikDev/qwik/pull/8383))

- 🐞🩹 block scoped variables in a loop should be correctly captured by qrls (by [@Varixo](https://github.com/Varixo) in [#8382](https://github.com/QwikDev/qwik/pull/8382))

- 🐞🩹 resuming vnodes with non-qwik element in the middle (by [@Varixo](https://github.com/Varixo) in [#8380](https://github.com/QwikDev/qwik/pull/8380))

- 🐞🩹 bind:value and bind:checked should be correctly converted in some edge cases (by [@Varixo](https://github.com/Varixo) in [#8384](https://github.com/QwikDev/qwik/pull/8384))

## 2.0.0-beta.24

### Minor Changes

- ✨ Signals now expose `.untrackedValue`, which allows you to read the value without subscribing, and `.trigger()`, which allows you to trigger running subscribers, for example when you changed `.untrackedValue` earlier, or the value mutated but remained the same object. (by [@wmertens](https://github.com/wmertens) in [#6903](https://github.com/QwikDev/qwik/pull/6903))

- ✨ `useAsync$` `clientOnly` option, to load a value on document-idle on the client (by [@wmertens](https://github.com/wmertens) in [#8348](https://github.com/QwikDev/qwik/pull/8348))

### Patch Changes

- perf: less style recalculations on resume (by [@Varixo](https://github.com/Varixo) in [#8366](https://github.com/QwikDev/qwik/pull/8366))

- 🐞🩹 array of undefineds as event handler (by [@Varixo](https://github.com/Varixo) in [#8363](https://github.com/QwikDev/qwik/pull/8363))

- 🐞🩹 inline components now correctly subscribe to signals (by [@Varixo](https://github.com/Varixo) in [#8365](https://github.com/QwikDev/qwik/pull/8365))

- 🐞🩹 descending dirty children for deleted parent (by [@Varixo](https://github.com/Varixo) in [#8358](https://github.com/QwikDev/qwik/pull/8358))

- 🐞🩹 diffing empty texts with element or virtual was sometimes incorrect (by [@Varixo](https://github.com/Varixo) in [#8367](https://github.com/QwikDev/qwik/pull/8367))

- 🐞🩹 serializing falsy event handlers (by [@Varixo](https://github.com/Varixo) in [#8361](https://github.com/QwikDev/qwik/pull/8361))

- 🐞🩹 handling qrl captures in a loop (by [@Varixo](https://github.com/Varixo) in [#8355](https://github.com/QwikDev/qwik/pull/8355))

## 2.0.0-beta.23

## 2.0.0-beta.22

### Major Changes

- BREAKING: the `.promise()` method on `useAsync$` now returns a `Promise<void>` instead of `Promise<T>`, to avoid having to put `.catch()` on every call and to promote using the reactive `result.value` and `result.error` properties for handling async results and errors. (by [@wmertens](https://github.com/wmertens) in [#8301](https://github.com/QwikDev/qwik/pull/8301))

### Minor Changes

- ✨ Big `useAsync$()` changes, now it's a one-stop shop for implementing async data fetching, streaming, auto-updating values, and background calculations. It has a writable result, better error handling, optional initial value, eager cleanup, polling, concurrency control, and abort support. (by [@wmertens](https://github.com/wmertens) in [#8301](https://github.com/QwikDev/qwik/pull/8301))
  - ✨ `useAsync$()` now has `interval`, which re-runs the compute function on intervals. You can change signal.interval to enable/disable it, and if you set it during SSR it will automatically resume to do the polling.
    This way, you can auto-update data on the client without needing to set up timers or events. For example, you can show a "time ago" string that updates every minute, or you can poll an API for updates, and change the poll interval when the window goes idle.
  - ✨ `useAsync$()` now has a `concurrency` option, which limits the number of concurrent executions of the compute function. If a new execution is triggered while the limit is reached, it will wait for the previous ones to finish before starting. This is useful for preventing overload when the compute function is expensive or when it involves network requests. The default value is 1, which means that a new execution will wait for the previous one to finish before starting. Setting it to 0 allows unlimited concurrent executions.
    In-flight invocations will update the signal value only if they complete before a newer invocation completes. For example, if you have a search input that triggers a new `useAsync$` execution on every keystroke, results will show in the correct order.
  - ✨ `useAsync$()` now has an `abort()` method, which aborts the current computation and runs cleanups if needed. This allows you to cancel long-running tasks when they are no longer needed, such as when a component unmounts or when a new computation starts. The compute function needs to use the `abortSignal` provided to handle aborts gracefully.
    When a new computation starts, the previous computation will be aborted via the abortSignal. This allows you to prevent unnecessary work and ensure that only the latest computation is active. For example, if you have a search input that triggers a new `useAsync$` execution on every keystroke, the previous search will be aborted when a new one starts, ensuring that only the latest search is performed.
  - the default serialization strategy for `useAsync$` is now 'always' instead of 'never', because it is likely to be expensive to get.

- DEPRECATION: `useResource$` and `<Resource />` are now deprecated. `useAsync$` is more efficient, more flexible, and easier to use. Use `concurrency: 0` to have the same behavior as `useResource$`. (by [@wmertens](https://github.com/wmertens) in [#8301](https://github.com/QwikDev/qwik/pull/8301))

## 2.0.0-beta.21

### Major Changes

- BREAKING (if you used previous betas): `useAsyncComputed$` is renamed to `useAsync$`. This reflects the many uses for it, not just computing. (by [@wmertens](https://github.com/wmertens) in [#8297](https://github.com/QwikDev/qwik/pull/8297))

## 2.0.0-beta.20

### Major Changes

- 🐞🩹 `runQrl is not a function` is not a problem any more thanks to a thorough refactor of QRL handling. (by [@wmertens](https://github.com/wmertens) and [@Varixo](https://github.com/Varixo) in [#8227](https://github.com/QwikDev/qwik/pull/8227))

- BREAKING: qwikloader now expects a different syntax for QRLs. You cannot use the v2 qwikloader with v1 containers.
- BREAKING: If you rerender a component with `qidle` or `qinit` handlers, those will run again. Previously they would only run when they were present while the page was first loaded. (by [@wmertens](https://github.com/wmertens) in [#8292](https://github.com/QwikDev/qwik/pull/8292))

- BREAKING: qwikloader no longer support v1 containers. If you want to use v1 containers, you must add the v1 qwikloader on the page as well.

- BREAKING: event handlers attributes used to be converted to `on:kebab-eventname` and `on-window:kebab-eventname`, and now they are converted to `q-e:kebab-event-name` and `q-w:kebab-event-name`. This simplifies the parsing and avoids qwikloader v1 trying to handle these events. These are undocumented internal names only, so this should not affect you.

- BREAKING: QRLs used to be separated by newline characters in event handler attributes, and are now separated by `|`. This should not affect you.

- 🐞🩹: `preventdefault:event` and `stoppropagation:event` now expect the event name to be in kebab-case. Note that they were already enforcing lowercase names, and DOM events are almost all lowercase, so this just allows working with custom events.

- ✨: Qwikloader now supports containers added at runtime: It will run `qinit`, `qidle` and `qvisible` events as appropriate.

### Patch Changes

- 🐞🩹 build path for html files in ssg (by [@Varixo](https://github.com/Varixo) in [#8289](https://github.com/QwikDev/qwik/pull/8289))

## 2.0.0-beta.19

### Patch Changes

- 🐞🩹 over-cleaning store subscriptions (by [@Varixo](https://github.com/Varixo) in [#8286](https://github.com/QwikDev/qwik/pull/8286))

## 2.0.0-beta.18

### Patch Changes

- 🐞🩹 getting flags on undefined (by [@Varixo](https://github.com/Varixo) in [#8280](https://github.com/QwikDev/qwik/pull/8280))

- 🐞🩹 rendering component with async tasks on server (by [@Varixo](https://github.com/Varixo) in [#8262](https://github.com/QwikDev/qwik/pull/8262))

- 🐞🩹 `waitForDrain` now also waits for paused cursors (by [@wmertens](https://github.com/wmertens) in [#8277](https://github.com/QwikDev/qwik/pull/8277))

- 🐞🩹 rendering var prop svg attributes with correct namespaces (by [@Varixo](https://github.com/Varixo) in [#8263](https://github.com/QwikDev/qwik/pull/8263))

- 🐞🩹 multiple event registering (by [@Varixo](https://github.com/Varixo) in [#8228](https://github.com/QwikDev/qwik/pull/8228))

- 🐞🩹 trigger visible task when component returns null or undefined (by [@Varixo](https://github.com/Varixo) in [#8259](https://github.com/QwikDev/qwik/pull/8259))

- 🐞🩹 iteration variable in qrl prop (by [@Varixo](https://github.com/Varixo) in [#8249](https://github.com/QwikDev/qwik/pull/8249))

- 🐞🩹 component's content rerender with slot edge case (by [@Varixo](https://github.com/Varixo) in [#8270](https://github.com/QwikDev/qwik/pull/8270))

- test: nested slotted components should call cleanup inside useTask after calling cleanup on component tree rendered clientside (by [@sashkashishka](https://github.com/sashkashishka) in [#8238](https://github.com/QwikDev/qwik/pull/8238))

- 🐞🩹 we now prevent merging useVisibleTask$ and useComputed$ code together with other segments to prevent overpreloading when their entry contains a lot of transitive imports. (by [@maiieul](https://github.com/maiieul) in [#8274](https://github.com/QwikDev/qwik/pull/8274))

- 🐞🩹 merging onInput$ and bind handlers (by [@Varixo](https://github.com/Varixo) in [#8240](https://github.com/QwikDev/qwik/pull/8240))

- 🐞🩹 rendering arrays without keys (by [@Varixo](https://github.com/Varixo) in [#8267](https://github.com/QwikDev/qwik/pull/8267))

- 🐞🩹 computed signal memory leak when reusing effect subscriber in loop (by [@Varixo](https://github.com/Varixo) in [#8254](https://github.com/QwikDev/qwik/pull/8254))

- 🐞🩹 finding context in unclaimed projections (by [@Varixo](https://github.com/Varixo) in [#8258](https://github.com/QwikDev/qwik/pull/8258))

- 🐞🩹 after resuming, visible tasks only run when actually visible, not just when a task needs running. During CSR the behavior remains unchanged, they run immediately. (by [@wmertens](https://github.com/wmertens) in [#8276](https://github.com/QwikDev/qwik/pull/8276))

## 2.0.0-beta.17

### Minor Changes

- ✨ cursor based chore scheduling (by [@Varixo](https://github.com/Varixo) in [#8181](https://github.com/QwikDev/qwik/pull/8181)), for CSR.

### Patch Changes

- 🐞🩹 apply journal in correct order for some edge cases (by [@Varixo](https://github.com/Varixo) in [#8218](https://github.com/QwikDev/qwik/pull/8218))

- 🐞🩹 correct escaping separator characters in attributes (by [@Varixo](https://github.com/Varixo) in [#8216](https://github.com/QwikDev/qwik/pull/8216))

- 🐞🩹 reduce memory allocation for cursors (by [@Varixo](https://github.com/Varixo) in [#8212](https://github.com/QwikDev/qwik/pull/8212))

## 2.0.0-beta.16

### Patch Changes

- ✨ Introduced the QRLInternal type (by [@JerryWu1234](https://github.com/JerryWu1234) in [#8193](https://github.com/QwikDev/qwik/pull/8193))

## 2.0.0-beta.15

### Minor Changes

- 🐞🩹 don't trigger document and window events for normal events (by [@Varixo](https://github.com/Varixo) in [#8170](https://github.com/QwikDev/qwik/pull/8170))

- ✨ make props more reactive for var props (by [@Varixo](https://github.com/Varixo) in [#8156](https://github.com/QwikDev/qwik/pull/8156))

### Patch Changes

- 🐞🩹 defer setting scoped style until jsx is resolved (by [@Varixo](https://github.com/Varixo) in [#8161](https://github.com/QwikDev/qwik/pull/8161))

- 🐞🩹 serialize correctly null or undefined value for signals (by [@Varixo](https://github.com/Varixo) in [#8160](https://github.com/QwikDev/qwik/pull/8160))

- 🐞🩹 removing children from var props (by [@Varixo](https://github.com/Varixo) in [#8188](https://github.com/QwikDev/qwik/pull/8188))

- 🐞🩹 correct running chores handling edge case (by [@Varixo](https://github.com/Varixo) in [#8167](https://github.com/QwikDev/qwik/pull/8167))

- 🐞🩹 finding projections after client partial rerender (by [@Varixo](https://github.com/Varixo) in [#8185](https://github.com/QwikDev/qwik/pull/8185))

- 🐞🩹 setting undefined as input value (by [@Varixo](https://github.com/Varixo) in [#8157](https://github.com/QwikDev/qwik/pull/8157))

## 2.0.0-beta.14

### Major Changes

- BREAKING: the CJS/UMD builds have been removed; ESM is well-supported everywhere and allows better optimizations. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#8103](https://github.com/QwikDev/qwik/pull/8103))

### Minor Changes

- ✨ `useAsync$`: rename .resolve() to .promise() (by [@Varixo](https://github.com/Varixo) in [#8126](https://github.com/QwikDev/qwik/pull/8126))

- ✨ introduce deferUpdates option for useTask$ (by [@Varixo](https://github.com/Varixo) in [#8107](https://github.com/QwikDev/qwik/pull/8107))

- ✨ support promises in attributes (by [@Varixo](https://github.com/Varixo) in [#8117](https://github.com/QwikDev/qwik/pull/8117))

- ✨ change behavior of useAsync$ to throw only once (by [@Varixo](https://github.com/Varixo) in [#8126](https://github.com/QwikDev/qwik/pull/8126))

### Patch Changes

- 🐞🩹 Qwik vite plugin respects outDir change (by [@gnemanja](https://github.com/gnemanja) in [#8127](https://github.com/QwikDev/qwik/pull/8127))

- 🐞🩹 serializing reused qrl (by [@Varixo](https://github.com/Varixo) in [#8131](https://github.com/QwikDev/qwik/pull/8131))

- 🐞🩹 allow to modify inline component's children component props (by [@Varixo](https://github.com/Varixo) in [#8141](https://github.com/QwikDev/qwik/pull/8141))

- 🐞🩹 The types for the JSX event handlers are more precise about their scope (e.g. no `document:OnQVisible$` or `onQIdle$`). (by [@wmertens](https://github.com/wmertens) in [#8134](https://github.com/QwikDev/qwik/pull/8134))

## 2.0.0-beta.13

### Minor Changes

- ✨ add resolve method for async computed (by [@Varixo](https://github.com/Varixo) in [#7881](https://github.com/QwikDev/qwik/pull/7881))

### Patch Changes

- 🐞🩹 checking if object is serializable in dev mode (by [@Varixo](https://github.com/Varixo) in [#8106](https://github.com/QwikDev/qwik/pull/8106))

- 🐞🩹 don't emit script before qwik style element (by [@Varixo](https://github.com/Varixo) in [#8124](https://github.com/QwikDev/qwik/pull/8124))

- 🐞🩹 ensure DOM is updated during long running tasks (by [@Varixo](https://github.com/Varixo) in [#8087](https://github.com/QwikDev/qwik/pull/8087))

- 🐞🩹 useId should genereate different id for ssr (by [@Varixo](https://github.com/Varixo) in [#8094](https://github.com/QwikDev/qwik/pull/8094))

## 2.0.0-beta.12

### Major Changes

- BREAKING: (slightly) `-` handling in JSX event handlers has slightly changed. Now, if an event name starts with `-`, the rest of the name will be kept as-is, preserving casing. Otherwise, the event name is made lowercase. Any `-` characters in the middle of the name are preserved as-is. Previously, `-` were considered to mark the next letter as uppercase. (by [@wmertens](https://github.com/wmertens) in [#8060](https://github.com/QwikDev/qwik/pull/8060))
  For example, `onCustomEvent$` will match `customevent`, `on-CustomEvent$` will match `CustomEvent`, and `onCustom-Event$` will match `custom-event`. Before, that last one would match `customEvent` instead.

- BREAKING: When using the `base` setting in Vite, the client build will no longer be placed under that base path. Instead, the output directory is always `dist/` by default. If you need to change the output directory, use the `build.outDir` setting in Vite or the `outDir` option in the `qwikVite` plugin under `client` or `ssr`. (by [@wmertens](https://github.com/wmertens) in [#8064](https://github.com/QwikDev/qwik/pull/8064))

### Minor Changes

- ✨ `qwikVite` now accepts `ssr.manifestInputPath` for when the `q-manifest.json` file from the client build is at an unexpected location. (by [@wmertens](https://github.com/wmertens) in [#8064](https://github.com/QwikDev/qwik/pull/8064))

- ✨ `bind:checked` and `bind:value` now also work through spread props, and they result in less code. (by [@wmertens](https://github.com/wmertens) in [#7321](https://github.com/QwikDev/qwik/pull/7321))

### Patch Changes

- ✨ All vite.config.mts files got renamed to vite.config.ts files, because all starters are marked as ESM projects (by [@wmertens](https://github.com/wmertens) in [#8084](https://github.com/QwikDev/qwik/pull/8084))

- 🐞🩹 backpatches ignore unknown nodes (by [@thejackshelton](https://github.com/thejackshelton) in [#8076](https://github.com/QwikDev/qwik/pull/8076))

- 🐞🩹 blocking slot parent and parent order (by [@Varixo](https://github.com/Varixo) in [#8070](https://github.com/QwikDev/qwik/pull/8070))

- ✨ withLocale() uses AsyncLocalStorage for server-side requests when available. This allows async operations to retain the correct locale context. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7826](https://github.com/QwikDev/qwik/pull/7826))

- 🐞🩹 core now throws an error when a qwik lib package is not added to ssr.noExternal (by [@maiieul](https://github.com/maiieul) in [#8062](https://github.com/QwikDev/qwik/pull/8062))

- 🐞🩹 adding and removing attributes on vnodes (by [@Varixo](https://github.com/Varixo) in [#8030](https://github.com/QwikDev/qwik/pull/8030))

- 🐞🩹 reblocking chores in scheduler (by [@Varixo](https://github.com/Varixo) in [#8077](https://github.com/QwikDev/qwik/pull/8077))

- 🐞🩹 memory leak for reactive attributes (by [@Varixo](https://github.com/Varixo) in [#7997](https://github.com/QwikDev/qwik/pull/7997))

- 🐞🩹 scheduling previously blocked chore (by [@Varixo](https://github.com/Varixo) in [#8028](https://github.com/QwikDev/qwik/pull/8028))

## 2.0.0-beta.11

### Patch Changes

- 🐞🩹 Better configuration of Vite's optimizeDeps, preventing false duplication warnings, and verifying that Qwik dependencies are not in optimizeDeps. (by [@wmertens](https://github.com/wmertens) in [#7998](https://github.com/QwikDev/qwik/pull/7998))

- 🐞🩹 resuming app with non-qwik elements inside (by [@Varixo](https://github.com/Varixo) in [#7991](https://github.com/QwikDev/qwik/pull/7991))

- 🐞🩹 During deserialization, stores now correctly handle cyclic references to themselves (by [@wmertens](https://github.com/wmertens) in [#7998](https://github.com/QwikDev/qwik/pull/7998))

## 2.0.0-beta.10

### Minor Changes

- ✨ split Qwik Core and Router dev experience. Core now only adjusts the html using the Vite hook for it, so it can work in any environment or client-only. You can make a Qwik application client-only by running `qwik add csr` now. (by [@wmertens](https://github.com/wmertens) in [#7890](https://github.com/QwikDev/qwik/pull/7890))
- ✨ Qwik Route now runs dev mode using the node middleware, which is the same as production, and can now hot-reload when routes are added. It does this by transforming the response while it streams to add the dev scripts. This opens the door for Vite Environment support.
- ✨ `qwikVite()` SSR builds now reads the manifest from the client build whenever possible. You can still pass in the manifest yourself if needed.
- 🐞🩹 Qwik Router's Vite plugin no longer imports Qwik Core, a cause of duplicate imports in dev and preview mode.
- 🐞🩹 Sometimes, SSG hangs after completion. The cause is still unknown, but now there is a workaround by forcing the process to exit after SSG is done.

### Patch Changes

- 🐞🩹 resuming shadow dom container with multiple root children (by [@Varixo](https://github.com/Varixo) in [#7943](https://github.com/QwikDev/qwik/pull/7943))

## 2.0.0-beta.9

### Minor Changes

- ✨ new async scheduler (by [@Varixo](https://github.com/Varixo) in [#7816](https://github.com/QwikDev/qwik/pull/7816))

- BREAKING: (slightly) Qwik will no longer scan all modules at build start to detect Qwik modules (which should be bundled into your server code). Instead, a much faster build-time check is done, and Qwik will tell you if you need to update your `ssr.noExternal` settings in your Vite config. (by [@wmertens](https://github.com/wmertens) in [#7784](https://github.com/QwikDev/qwik/pull/7784))

- ✨ expose `loading` and `error` fields of async computed signal (by [@Varixo](https://github.com/Varixo) in [#7876](https://github.com/QwikDev/qwik/pull/7876))

### Patch Changes

- 🐞🩹 ignore diffing for deleted parent (by [@Varixo](https://github.com/Varixo) in [#7816](https://github.com/QwikDev/qwik/pull/7816))

- 🐞🩹 convert any destructured props to restProps helper (by [@Varixo](https://github.com/Varixo) in [#7880](https://github.com/QwikDev/qwik/pull/7880))

- 🐞🩹 calling sync qrls should not go through scheduler (by [@Varixo](https://github.com/Varixo) in [#7816](https://github.com/QwikDev/qwik/pull/7816))

- ✨ add SSR backpatching (attributes-only) to ensure SSR/CSR parity for signal-driven attributes; limited to attribute updates (not OoO streaming) (by [@thejackshelton](https://github.com/thejackshelton) in [#7900](https://github.com/QwikDev/qwik/pull/7900))

- 🐞🩹 avoid potential name conflicts with rest props (by [@Varixo](https://github.com/Varixo) in [#7880](https://github.com/QwikDev/qwik/pull/7880))

- 🐞🩹 handling spread props on element node (by [@Varixo](https://github.com/Varixo) in [#7929](https://github.com/QwikDev/qwik/pull/7929))

- 🐞🩹 finding parent dom element from projected content (by [@Varixo](https://github.com/Varixo) in [#7886](https://github.com/QwikDev/qwik/pull/7886))

- 🐞🩹 calling document:onQInit qrls (by [@Varixo](https://github.com/Varixo) in [#7816](https://github.com/QwikDev/qwik/pull/7816))

- 🐞🩹 finding slot parent during scheduling chores (by [@Varixo](https://github.com/Varixo) in [#7816](https://github.com/QwikDev/qwik/pull/7816))

- 🐞🩹 resuming nested container in shadow root (by [@Varixo](https://github.com/Varixo) in [#7937](https://github.com/QwikDev/qwik/pull/7937))

- 🐞🩹 computed signal recomputing and triggering effects (by [@Varixo](https://github.com/Varixo) in [#7816](https://github.com/QwikDev/qwik/pull/7816))

## 2.0.0-beta.8

### Patch Changes

- 🐞🩹 handle falsy value as context value (by [@Varixo](https://github.com/Varixo) in [#7814](https://github.com/QwikDev/qwik/pull/7814))

- Add explicit tag nesting rules for <picture> and <button> elements (by [@tzdesign](https://github.com/tzdesign) in [#7798](https://github.com/QwikDev/qwik/pull/7798))

- 🐞🩹 reactivity after spreading props (by [@Varixo](https://github.com/Varixo) in [#7809](https://github.com/QwikDev/qwik/pull/7809))

- 🐞🩹 handle falsy value for dangerouslySetInnerHTML (by [@Varixo](https://github.com/Varixo) in [#7810](https://github.com/QwikDev/qwik/pull/7810))

## 2.0.0-beta.7

## 2.0.0-beta.6

### Minor Changes

- ✨ the QRL segment mapping during Vite dev mode now happens in core and does not require providing a separate `symbolMapper` function any more. (by [@wmertens](https://github.com/wmertens) in [#7748](https://github.com/QwikDev/qwik/pull/7748))

- ✨ Server output chunk files are now under their own build/ subdir, like the client build. This makes it easier to override the chunk filenames. This is possible because the Router metadata files are now an earlier part of the build process. (by [@wmertens](https://github.com/wmertens) in [#7748](https://github.com/QwikDev/qwik/pull/7748))

- 🐞🩹 `qwikVite` has better vite config handling around input files, and no longer writes the q-manifest file to a temp dir. (by [@wmertens](https://github.com/wmertens) in [#7748](https://github.com/QwikDev/qwik/pull/7748))

### Patch Changes

- 🐞🩹 the `srcInput` option to `qwikVite` is deprecated because it's unused. (by [@wmertens](https://github.com/wmertens) in [#7748](https://github.com/QwikDev/qwik/pull/7748))

- 🐞🩹 preserve innerHTML after component rerender (by [@Varixo](https://github.com/Varixo) in [#7740](https://github.com/QwikDev/qwik/pull/7740))

- 🐞🩹 render SVG attributes with correct namespace (by [@Varixo](https://github.com/Varixo) in [#7705](https://github.com/QwikDev/qwik/pull/7705))

- 🐞🩹 using useOn and useVisibleTask$ in component with primitive value only (by [@Varixo](https://github.com/Varixo) in [#7746](https://github.com/QwikDev/qwik/pull/7746))

## 2.0.0-beta.5

### Patch Changes

- 🐞🩹 don't wrap function calls in signal (by [@Varixo](https://github.com/Varixo) in [#7707](https://github.com/QwikDev/qwik/pull/7707))

## 2.0.0-beta.4

### Minor Changes

- ✨ implement new SerializationWeakRef class for values that can be not serialized (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

- ✨ expose option to never or always serialize computed-like signal value (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

### Patch Changes

- 🐞🩹 async computed signal promise rejection (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

- ✨ expose invalidate method for computed-like signals (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

- 🐞🩹 maximum component rerender retries (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

- 🐞🩹 serializer symbol value recalculate without update function (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

- 🐞🩹 async computed correctly handle returning falsy value (by [@Varixo](https://github.com/Varixo) in [#7466](https://github.com/QwikDev/qwik/pull/7466))

## 2.0.0-beta.3

### Patch Changes

- 🐞🩹 resuming a component using styles and a text node (by [@Varixo](https://github.com/Varixo) in [#7668](https://github.com/QwikDev/qwik/pull/7668))

- 🐞🩹 reuse the same props instance when props are changing (by [@Varixo](https://github.com/Varixo) in [#7672](https://github.com/QwikDev/qwik/pull/7672))

- 🐞🩹 the @qwik-handlers aren't properly handled in dev mode for library projects (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7608](https://github.com/QwikDev/qwik/pull/7608))

- 🐞🩹 subscribe to signals on computed signal recomputation (by [@Varixo](https://github.com/Varixo) in [#7700](https://github.com/QwikDev/qwik/pull/7700))

- :zap: QRL segments now memoize imports, removing some Promises during render (by [@wmertens](https://github.com/wmertens) in [#7686](https://github.com/QwikDev/qwik/pull/7686))

- 🐞🩹 allow special characters in key attribute (by [@Varixo](https://github.com/Varixo) in [#7677](https://github.com/QwikDev/qwik/pull/7677))

## 2.0.0-beta.2

### Patch Changes

- 🐞🩹 correctly serialize vnode props in production mode (by [@Varixo](https://github.com/Varixo) in [#7666](https://github.com/QwikDev/qwik/pull/7666))

## 2.0.0-beta.1

### Minor Changes

- ✨ new hook - useAsync$ in replacement of useComputed$ with async operations (by [@Varixo](https://github.com/Varixo) in [#7589](https://github.com/QwikDev/qwik/pull/7589))

### Patch Changes

- 🐞🩹 proper empty props diffing (by [@Varixo](https://github.com/Varixo) in [#7633](https://github.com/QwikDev/qwik/pull/7633))

- 🐞🩹 serialize less vnode data (by [@Varixo](https://github.com/Varixo) in [#7636](https://github.com/QwikDev/qwik/pull/7636))

- 🐞🩹 don't wrap static objects with signal (by [@Varixo](https://github.com/Varixo) in [#7637](https://github.com/QwikDev/qwik/pull/7637))

- 🐞🩹 ensure components are only rendered when necessary (by [@Varixo](https://github.com/Varixo) in [#7631](https://github.com/QwikDev/qwik/pull/7631))

- 🐞🩹 skip serialize functions wrapped with the `noSerialize` (by [@Varixo](https://github.com/Varixo) in [#7621](https://github.com/QwikDev/qwik/pull/7621))

- 🐞🩹 reactivity for type-asserted variables in templates (by [@Varixo](https://github.com/Varixo) in [#7619](https://github.com/QwikDev/qwik/pull/7619))

- 🐞🩹 reactivity for logical expressions in templates (by [@Varixo](https://github.com/Varixo) in [#7619](https://github.com/QwikDev/qwik/pull/7619))

- ✨ When an error occurs during SSR due to using the browser APIs, show an explanation. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7571](https://github.com/QwikDev/qwik/pull/7571))

## 2.0.0-alpha.10

### Patch Changes

- 🐞🩹 infinity loop while tracking element ref (by [@Varixo](https://github.com/Varixo) in [#7574](https://github.com/QwikDev/qwik/pull/7574))

- 🐞🩹 add HTMLElementAttrs and SVGProps types to exports (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7510](https://github.com/QwikDev/qwik/pull/7510))

- 🐞🩹 Introduce retry logic for QRL resolution to handle potential promise retries, ensuring robustness in asynchronous operations. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7470](https://github.com/QwikDev/qwik/pull/7470))

- 🐞🩹 signal wrapper should not rerender causing missing child error (by [@Varixo](https://github.com/Varixo) in [#7550](https://github.com/QwikDev/qwik/pull/7550))

- 🐞🩹 inflating text nodes from single shared text node (by [@Varixo](https://github.com/Varixo) in [#7538](https://github.com/QwikDev/qwik/pull/7538))

## 2.0.0-alpha.9

### Minor Changes

- ✨ `useSerializer# @qwik.dev/core, `createSerializer# @qwik.dev/core: Create a Signal holding a custom serializable value. See {@link useSerializer$} for more details. (by [@wmertens](https://github.com/wmertens) in [#7223](https://github.com/QwikDev/qwik/pull/7223))

  `NoSerializeSymbol`: objects that have this symbol will not be serialized.

  `SerializerSymbol`: When defined on an object, this function will get called with the object and is expected to returned a serializable object literal representing this object. Use this to remove data cached data, consolidate things, integrate with other libraries, etc.

### Patch Changes

- 🐞🩹 don't wrap template literals with a function call inside them in a signal (by [@Varixo](https://github.com/Varixo) in [#7390](https://github.com/QwikDev/qwik/pull/7390))

- 🐞🩹 creating error overlay (by [@Varixo](https://github.com/Varixo) in [#7446](https://github.com/QwikDev/qwik/pull/7446))

- 🐞🩹 reexecute component with null key (by [@Varixo](https://github.com/Varixo) in [#7456](https://github.com/QwikDev/qwik/pull/7456))

- 🐞🩹 correctly handle initial resource state (by [@Varixo](https://github.com/Varixo) in [#7469](https://github.com/QwikDev/qwik/pull/7469))

- 🐞🩹 change client side generated ID to start with build base and add convert first character to letter if it is starting from number (by [@Varixo](https://github.com/Varixo) in [#7432](https://github.com/QwikDev/qwik/pull/7432))

- 🐞🩹 custom event names and DOMContentLoaded handling (by [@Varixo](https://github.com/Varixo) in [#7452](https://github.com/QwikDev/qwik/pull/7452))

- 🐞🩹 attribute diffing was not working correctly in some edge cases (by [@Varixo](https://github.com/Varixo) in [#7419](https://github.com/QwikDev/qwik/pull/7419))

- 🐞🩹 rendering markdown file with Qwik component (by [@Varixo](https://github.com/Varixo) in [#7456](https://github.com/QwikDev/qwik/pull/7456))

- 🐞🩹 finding vnodes on interaction (by [@Varixo](https://github.com/Varixo) in [#7410](https://github.com/QwikDev/qwik/pull/7410))

- 🐞🩹 don't execute QRLs for elements marked as deleted (by [@Varixo](https://github.com/Varixo) in [#7448](https://github.com/QwikDev/qwik/pull/7448))

- 🐞🩹 inserting new node edge case (by [@Varixo](https://github.com/Varixo) in [#7446](https://github.com/QwikDev/qwik/pull/7446))

- 🐞🩹 removing text node from shared text node (by [@Varixo](https://github.com/Varixo) in [#7430](https://github.com/QwikDev/qwik/pull/7430))

## 2.0.0-alpha.8

### Patch Changes

- 🐞🩹 don't escape value attribute (by [@Varixo](https://github.com/Varixo) in [#7369](https://github.com/QwikDev/qwik/pull/7369))

- 🐞🩹 prevent infinity loop by inserting the same projection before itself (by [@Varixo](https://github.com/Varixo) in [#7350](https://github.com/QwikDev/qwik/pull/7350))

- 🐞🩹 replace inline component with component$ with the same key (by [@Varixo](https://github.com/Varixo) in [#7365](https://github.com/QwikDev/qwik/pull/7365))

- 🐞🩹 undefined or null as projection child (by [@Varixo](https://github.com/Varixo) in [#7376](https://github.com/QwikDev/qwik/pull/7376))

- 🐞🩹 infinity serialization loop (by [@Varixo](https://github.com/Varixo) in [#7368](https://github.com/QwikDev/qwik/pull/7368))

- 🐞🩹 prevent reusing projection if is marked as deleted (by [@Varixo](https://github.com/Varixo) in [#7350](https://github.com/QwikDev/qwik/pull/7350))

- 🐞🩹 tracking whole store (by [@Varixo](https://github.com/Varixo) in [#7367](https://github.com/QwikDev/qwik/pull/7367))

## 2.0.0-alpha.7

### Patch Changes

- 🐞🩹 rendering attribute value from array of classes from spread props (by [@Varixo](https://github.com/Varixo) in [#7310](https://github.com/QwikDev/qwik/pull/7310))

- 🐞🩹 null or undefined as ref attribute value (by [@Varixo](https://github.com/Varixo) in [#7285](https://github.com/QwikDev/qwik/pull/7285))

- 🐞🩹 QRLs are now scheduled instead of directly executed by qwik-loader, so that they are executed in the right order. (by [@wmertens](https://github.com/wmertens) in [#7269](https://github.com/QwikDev/qwik/pull/7269))

- 🐞🩹 different component rendering with the same key (by [@Varixo](https://github.com/Varixo) in [#7292](https://github.com/QwikDev/qwik/pull/7292))

- 🐞🩹 export SVG type from qwik/core (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7222](https://github.com/QwikDev/qwik/pull/7222))

- 🐞🩹 optimizer is now better at recognizing constProp (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7316](https://github.com/QwikDev/qwik/pull/7316))

- 🐞🩹 create svg nested children with correct namespace (by [@Varixo](https://github.com/Varixo) in [#7323](https://github.com/QwikDev/qwik/pull/7323))

- 🐞🩹 the use hook didn't work when type is Slot. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7250](https://github.com/QwikDev/qwik/pull/7250))

- 🛠 replace the `_hW` export in segments with a shared export `_task` in core. This opens up using QRLs from core. (by [@wmertens](https://github.com/wmertens) in [#7269](https://github.com/QwikDev/qwik/pull/7269))

- ✨ emit "qrender" event after every render (by [@Varixo](https://github.com/Varixo) in [#7327](https://github.com/QwikDev/qwik/pull/7327))

- 🐞🩹 vNode serialization error on server$ (by [@damianpumar](https://github.com/damianpumar) in [#7278](https://github.com/QwikDev/qwik/pull/7278))

- 🐞🩹 don't wrap and serialize functions that are attribute values (by [@Varixo](https://github.com/Varixo) in [#7284](https://github.com/QwikDev/qwik/pull/7284))

- ✨ updated scoped styles prefix to ⚡️ (by [@sreeisalso](https://github.com/sreeisalso) in [#7304](https://github.com/QwikDev/qwik/pull/7304))

  # Scoped styles prefix update

  We've updated the `ComponentStylesPrefixContent` from the star symbol (⭐️) to the lightning bolt symbol (⚡️). This prefix is used internally to generate unique CSS class names for components, helping to prevent style collisions.

  **Potential Compatibility Issue (Rare):**

  While this change is expected to be seamless for the vast majority of users, there's a _very small_ possibility of a conflict if your application _directly relies_ on the star symbol (⭐️) for CSS overriding. Specifically, if you're using CSS selectors that include the _literal_ star character (⭐️) as part of a class name (e.g., `.⭐️ComponentName { ... }`), your styles require need to be changed manually to work as expected after this update.

  ## How to check if you're affected

  **Search your codebase:** Look for any instances where the star symbol (⭐️) is used as part of a CSS class name or selector.

  ## How to fix it if you're affected

  If you find that you are indeed relying on the star symbol (⭐️), you'll need to update your CSS selectors to use the new lightning bolt symbol (⚡️). For example, change `.⭐️ComponentName { ... }` to `.⚡️ComponentName { ... }`.

  ```css
  /* Example of old, potentially problematic CSS */
  .⭐️MyComponent {
    /* ... old styles ... */
  }

  /* Example of updated, correct CSS */
  .⚡️MyComponent {
    /* ... updated styles ... */
  }
  ```

- Expose missing types into `public.d.ts` and fix types uri for internal export inside `package.json` (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#7289](https://github.com/QwikDev/qwik/pull/7289))

## 2.0.0-alpha.6

### Patch Changes

- 🐞🩹 component props as var props (by [@Varixo](https://github.com/Varixo) in [#7265](https://github.com/QwikDev/qwik/pull/7265))

- 🐞🩹 input's value is string when passing number (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7182](https://github.com/QwikDev/qwik/pull/7182))

- ✨ log a warning instead of throwing an error for server host mismatch error (by [@Varixo](https://github.com/Varixo) in [#7236](https://github.com/QwikDev/qwik/pull/7236))

- 🐞🩹 retry vnode diffing on promise throw (by [@Varixo](https://github.com/Varixo) in [#7259](https://github.com/QwikDev/qwik/pull/7259))

- 🐞🩹 convert destructured array's props to signal (by [@Varixo](https://github.com/Varixo) in [#7217](https://github.com/QwikDev/qwik/pull/7217))

## 2.0.0-alpha.5

### Patch Changes

- 🐞🩹 Resource without onPending callback (by [@gimonaa](https://github.com/gimonaa) in [#7085](https://github.com/QwikDev/qwik/pull/7085))

- 🐞🩹 updating signal-based props (by [@Varixo](https://github.com/Varixo) in [#7198](https://github.com/QwikDev/qwik/pull/7198))

- 🐞🩹 store effects cleanup (by [@Varixo](https://github.com/Varixo) in [#7228](https://github.com/QwikDev/qwik/pull/7228))

- 🐞🩹 projection siblings serialization (by [@Varixo](https://github.com/Varixo) in [#7228](https://github.com/QwikDev/qwik/pull/7228))

- 🐞🩹 moving existing virtual node during vnode diffing (by [@Varixo](https://github.com/Varixo) in [#7208](https://github.com/QwikDev/qwik/pull/7208))

- 🐞🩹 convert destructured string prop to props variable (by [@Varixo](https://github.com/Varixo) in [#7191](https://github.com/QwikDev/qwik/pull/7191))

- 🐞🩹 finding context parent and sorting projections in the scheduler (by [@Varixo](https://github.com/Varixo) in [#7204](https://github.com/QwikDev/qwik/pull/7204))

- 🐞🩹 find correct context after rendering empty array (by [@Varixo](https://github.com/Varixo) in [#7234](https://github.com/QwikDev/qwik/pull/7234))

- 🐞🩹 textarea with null value (by [@Varixo](https://github.com/Varixo) in [#7196](https://github.com/QwikDev/qwik/pull/7196))

- 🐞🩹 event handlers in loops (by [@gimonaa](https://github.com/gimonaa) in [#7085](https://github.com/QwikDev/qwik/pull/7085))

- 🐞🩹 destructured props for inline components (by [@Varixo](https://github.com/Varixo) in [#7190](https://github.com/QwikDev/qwik/pull/7190))

- 🐞🩹 serialize var prop (by [@Varixo](https://github.com/Varixo) in [#7193](https://github.com/QwikDev/qwik/pull/7193))

## 2.0.0-alpha.4

### Patch Changes

- 🐞🩹 encode the `q:subs` property (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

- ✨ move signal invalidation to the scheduler (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

- ✨ better node attributes serialization (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

- 🐞🩹 serialize virtual props for DOM elements (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

## 2.0.0-alpha.3

### Patch Changes

- 🐞🩹 prevent multiple store deserialization (by [@Varixo](https://github.com/Varixo) in [#7155](https://github.com/QwikDev/qwik/pull/7155))

- 🐞🩹 using ref inside useContext (by [@Varixo](https://github.com/Varixo) in [#7132](https://github.com/QwikDev/qwik/pull/7132))

- 🐞🩹 types error when migrating to V2 with `moduleResulution: "node"` (by [@shairez](https://github.com/shairez) in [#7159](https://github.com/QwikDev/qwik/pull/7159))

- 🐞🩹 replacing projection content with null or undefined (by [@Varixo](https://github.com/Varixo) in [#7148](https://github.com/QwikDev/qwik/pull/7148))

## 2.0.0-alpha.2

### Patch Changes

- 🐞🩹 serialization of an array of refs (by [@Varixo](https://github.com/Varixo) in [#7106](https://github.com/QwikDev/qwik/pull/7106))

- 🛠 more descriptive HTML streaming error message (by [@Varixo](https://github.com/Varixo) in [#7105](https://github.com/QwikDev/qwik/pull/7105))

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

## 1.19.0

### Minor Changes

- ✨ `untrack()` now accepts signals and stores directly, as well as accepting arguments when you pass a function. This makes retrieving values without subscribing to them more efficient. (by [@wmertens](https://github.com/wmertens) in [#8247](https://github.com/QwikDev/qwik/pull/8247))

### Patch Changes

- 🐞🩹 we now prevent merging useVisibleTask$ code together with other segments to prevent overpreloading when their entry contains a lot of transitive imports. (by [@maiieul](https://github.com/maiieul) in [#8275](https://github.com/QwikDev/qwik/pull/8275))

- 🐞🩹 duplicated preload bundles in SSR preload (by [@chebanenko](https://github.com/chebanenko) in [#8248](https://github.com/QwikDev/qwik/pull/8248))

- ⚡️: the core.js and preloader.js references in q-manifest and bundle-graph are now filtered out for smaller outputs. (by [@maiieul](https://github.com/maiieul) in [#8278](https://github.com/QwikDev/qwik/pull/8278))

## 1.18.0

### Minor Changes

- PERF: Computed signals now only trigger listeners if their value has changed (by [@wmertens](https://github.com/wmertens) in [#8148](https://github.com/QwikDev/qwik/pull/8148))

### Patch Changes

- execute cleanup cb for all component tree while calling dispose.cleanup method returned by render fn (by [@sashkashishka](https://github.com/sashkashishka) in [#8164](https://github.com/QwikDev/qwik/pull/8164))

- 🐞🩹 useResource's onRejected now catches errors again; preventing unhandled errors in test environments. (by [@maiieul](https://github.com/maiieul) in [#8197](https://github.com/QwikDev/qwik/pull/8197))

- ✨ `qwik add compiled-i18` now adds easy i18n to your app. (by [@wmertens](https://github.com/wmertens) in [#8177](https://github.com/QwikDev/qwik/pull/8177))

## 1.17.2

## 1.17.1

### Patch Changes

- 🐞🩹 the bunding won't lead to circular dependencies in qwik-astro apps anymore. (by [@maiieul](https://github.com/maiieul) in [#8052](https://github.com/QwikDev/qwik/pull/8052))

- ✨ The optimizer is now built with a recent Rust toolchain. Fresher bits! (by [@wmertens](https://github.com/wmertens) in [#8040](https://github.com/QwikDev/qwik/pull/8040))

## 1.17.0

### Minor Changes

- 🐞🩹 Qwik now leverages Rollup's new `output.onlyExplicitManualChunks` feature, which improves preloading performance and reduces cache invalidation for a snappier user experience. (by [@maiieul](https://github.com/maiieul) in [#7982](https://github.com/QwikDev/qwik/pull/7982))

- ✨ the qwikloader can now be inlined again if required (for testing or specific network conditions). Pass `qwikLoader: 'inline'` to the render options. (by [@wmertens](https://github.com/wmertens) in [#8008](https://github.com/QwikDev/qwik/pull/8008))

### Patch Changes

- 🐞🩹 The Deno integration now builds successfully with version v2.4.3 and above. (by [@gioboa](https://github.com/gioboa) in [#7913](https://github.com/QwikDev/qwik/pull/7913))

- TEST: qwik react mount and unmount (by [@sashkashishka](https://github.com/sashkashishka) in [#7950](https://github.com/QwikDev/qwik/pull/7950))

- 🐞🩹 solve type error when using async \_resolved function (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7426](https://github.com/QwikDev/qwik/pull/7426))

- 🐞🩹 Click-to-Component is now more reliable across platforms (by [@wmertens](https://github.com/wmertens) in [#7923](https://github.com/QwikDev/qwik/pull/7923))

- 🛠 add qwik react e2e test runs to ci (by [@sashkashishka](https://github.com/sashkashishka) in [#7952](https://github.com/QwikDev/qwik/pull/7952))

## 1.16.1

### Patch Changes

- 🐞🩹 The entry.ssr renderToStream `preloader.preloadProbability` option is now deprecated because this could cause performance issues with bundles fetched on click instead of being preloaded ahead of time. (The preloader still relies on probabilities to know preload the most likely bundles first) (by [@maiieul](https://github.com/maiieul) in [#7847](https://github.com/QwikDev/qwik/pull/7847))

- 🐞🩹 Link prefetch now always preloads Link prefetch bundles on monorepos (by [@maiieul](https://github.com/maiieul) in [#7835](https://github.com/QwikDev/qwik/pull/7835))

- 🐞🩹 Rollup's hoistTranstiveImports is now set to `false` because the hoisting added unnecessary bundles to be preloaded to the bundle-graph static imports graph. This could lead to a suboptimal preloading experience. (by [@maiieul](https://github.com/maiieul) in [#7850](https://github.com/QwikDev/qwik/pull/7850))

- 🛠 Add check-client command to verify bundle freshness (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7517](https://github.com/QwikDev/qwik/pull/7517))

- ✨ All qwik packages are now marked as side effect free in their package.json. This should remove a few unecessary empty imports added by rollup and then not tree-shaken like `import "./preloader.js"`. (by [@maiieul](https://github.com/maiieul) in [#7908](https://github.com/QwikDev/qwik/pull/7908))

- 🐞🩹 unmount qwikify react root alongside with qwik component (by [@sashkashishka](https://github.com/sashkashishka) in [#7864](https://github.com/QwikDev/qwik/pull/7864))

- 🐞🩹 preloader now preloads bundles as long as they are part of the current viewport's bundles graph, even if their probability is very small (by [@maiieul](https://github.com/maiieul) in [#7836](https://github.com/QwikDev/qwik/pull/7836))

- ✨ maxIdlePreloads is now constant over time so you know for sure how many bundles will be preloaded concurrently during idle. (by [@maiieul](https://github.com/maiieul) in [#7846](https://github.com/QwikDev/qwik/pull/7846))

- 🛠 use patched domino instead of qwik-dom (by [@gioboa](https://github.com/gioboa) in [#7842](https://github.com/QwikDev/qwik/pull/7842))

- 🐞🩹 Qwik is now smarter at bundling non QRL source files and qwik libraries modules (e.g. helpers, enums, inline components, etc.) together. (by [@maiieul](https://github.com/maiieul) in [#7888](https://github.com/QwikDev/qwik/pull/7888))

## 1.16.0

### Minor Changes

- ✨ bump Vite to v7 (by [@gioboa](https://github.com/gioboa) in [#7762](https://github.com/QwikDev/qwik/pull/7762))

### Patch Changes

- 🐞🩹 Keeping the service worker components now properly unregisters them. (by [@maiieul](https://github.com/maiieul) in [#7781](https://github.com/QwikDev/qwik/pull/7781))

- 🛠 remove a grace period before unregistering events from qwikloader (by [@Varixo](https://github.com/Varixo) in [#7818](https://github.com/QwikDev/qwik/pull/7818))

- 🐞🩹 Keeping the service worker components now also removes their associated Cache storage. (by [@maiieul](https://github.com/maiieul) in [#7782](https://github.com/QwikDev/qwik/pull/7782))

- 🐞🩹 fix up open in editor feature (by [@LazyClicks](https://github.com/LazyClicks) in [#7785](https://github.com/QwikDev/qwik/pull/7785))

- 🐞🩹 SSR was missing some places with nonce for CSP. Now CSP should work even when strict-dynamic (by [@wmertens](https://github.com/wmertens) in [#7776](https://github.com/QwikDev/qwik/pull/7776))

## 1.15.0

### Minor Changes

- 🐞🩹 the preloader bundle graph file is now built as an asset. This is cleaner and avoids i18n translation of the file. (by [@wmertens](https://github.com/wmertens) in [#7650](https://github.com/QwikDev/qwik/pull/7650))

### Patch Changes

- 🐞🩹 Use correct working directory for Deno environment (by [@siguici](https://github.com/siguici) in [#7699](https://github.com/QwikDev/qwik/pull/7699))

- :zap: the qwikloader is no longer embedded in the SSR results. Instead, the same techniques are used as for the preloader to ensure that the qwikloader is active as soon as possible, loaded from a separate bundle. This reduces SSR page size by several kB end ensures that subsequent qwikloader loads are nearly instant. (by [@wmertens](https://github.com/wmertens) in [#7613](https://github.com/QwikDev/qwik/pull/7613))

- 🐞🩹 Removed backdrop-filter of vite-error-overlay to prevent perf issues with multiple errors (by [@intellix](https://github.com/intellix) in [#7676](https://github.com/QwikDev/qwik/pull/7676))

- 🐞🩹 assetsDir and debug:true will no longer break your application. (by [@maiieul](https://github.com/maiieul) in [#7638](https://github.com/QwikDev/qwik/pull/7638))

- 🐞🩹 We now also output the preloader as .cjs for non esm environments (e.g. jest 29 and below). (by [@maiieul](https://github.com/maiieul) in [#7736](https://github.com/QwikDev/qwik/pull/7736))

- 🐞🩹 cypress component tests became slow in 1.9.1. This is now fixed. (by [@maiieul](https://github.com/maiieul) in [#7736](https://github.com/QwikDev/qwik/pull/7736))

- ✨ q-manifest.json now also includes the generated assets (by [@wmertens](https://github.com/wmertens) in [#7650](https://github.com/QwikDev/qwik/pull/7650))

- 🐞🩹 support q-manifest resolution under Bun runtime (#7565) (by [@siguici](https://github.com/siguici) in [#7669](https://github.com/QwikDev/qwik/pull/7669))

- 🐞🩹 set correct script type for qwik loader (by [@Varixo](https://github.com/Varixo) in [#7710](https://github.com/QwikDev/qwik/pull/7710))

- 🛠 update devDependencies and configurations (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7695](https://github.com/QwikDev/qwik/pull/7695))

## 1.14.1

## 1.14.0

### Minor Changes

- ✨ Major improvements to prefetching with automatic bundle preloading (by [@wmertens](https://github.com/wmertens) in [#7453](https://github.com/QwikDev/qwik/pull/7453))
  - This removes the need for service workers, and instead utilize `modulepreload` link tags for better browser integration.
  - Improves initial load performance by including dynamic imports in the prefetch
  - Reduces complexity while maintaining similar (and even better) functionality
  - Enables some preloading capabilities in dev mode (SSR result only)
  - Includes path-to-bundle mapping in bundle graph (this improves the experience using the `<Link>` component, AKA "single page app" mode)
  - Server now has built-in manifest support (so no need to pass `manifest` around)
  - Moves insights-related build code to insights plugin

  ***

  ⚠️ **ATTENTION:**
  - **Keep** your service worker code as is (either `<ServiceWorkerRegister/>` or `<PrefetchServiceWorker/>`).
  - **Configure** your server to provide long caching headers.

  **Service Worker:**

  This new implementation will use it to uninstall the current service worker to reduce the unnecessary duplication.

  The builtin service workers components are deprecated but still exist for backwards compatibility.

  ⚠️ **IMPORTANT: Caching Headers:**

  The files under build/ and assets/ are named with their content hash and may therefore be cached indefinitely. Typically you should serve `build/*` and `assets/*` with `Cache-Control: public, max-age=31536000, immutable`.

  However, if you changed the rollup configuration for output filenames, you will have to adjust the caching configuration accordingly.

  ***

  You can configure the preload behavior in your SSR configuration:

  ```ts
  // entry.ssr.ts
  export default function (opts: RenderToStreamOptions) {
    return renderToStream(<Root />, {
      preload: {
        // Enable debug logging for preload operations
        debug: true,
        // Maximum simultaneous preload links
        maxIdlePreloads: 5,
        // Minimum probability threshold for preloading
        preloadProbability: 0.25
        // ...and more, see the type JSDoc on hover
      },
      ...opts,
    });
  }
  ```

  #### Optional for legacy apps:

  For legacy apps that still need service worker functionality, you can add it back using:

  ```bash
  npm run qwik add service-worker
  ```

  This will add a basic service worker setup that you can customize for specific caching strategies, offline support, or other PWA features beyond just prefetching.

### Patch Changes

- 🐞🩹 linting errors which were previously being ignored across the monorepo. (by [@better-salmon](https://github.com/better-salmon) in [#7418](https://github.com/QwikDev/qwik/pull/7418))

- 🐞🩹 now qwikloader is loaded only once in all cases (by [@wmertens](https://github.com/wmertens) in [#7506](https://github.com/QwikDev/qwik/pull/7506))

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
  export const useAsync$ = (qrlFn: QRL<() => Promise<any>>) => {
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
