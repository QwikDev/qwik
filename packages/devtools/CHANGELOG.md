# @qwik.dev/devtools

## 0.3.0-beta.2

### Minor Changes

- ✨ customize which tabs appear in the devtools sidebar (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8833](https://github.com/QwikDev/qwik/pull/8833))

- ✨ reach hidden devtools tabs from a sidebar More panel (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8833](https://github.com/QwikDev/qwik/pull/8833))

- ✨ drag to reorder the visible devtools sidebar tabs (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8833](https://github.com/QwikDev/qwik/pull/8833))

### Patch Changes

- refactor(devtools): extract findComponentKey and component-name derivation as runtime utilities (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8803](https://github.com/QwikDev/qwik/pull/8803))

  The component-key lookup and the "name after the last underscore" derivation were inlined inside
  the hook runtime installer and duplicated across getComponentDetail, setSignalValue, and
  getComponentTreeSnapshot. They are now top-level `__qwik_find_component_key__` and
  `__qwik_derive_component_name__` functions, emitted by name into the injected runtime bundle and
  reused by every caller. Being pure, they are also covered by unit tests.

- refactor: share the page data source contract between the ui and extension (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8804](https://github.com/QwikDev/qwik/pull/8804))

- refactor(devtools): single source of truth for shared protocol types (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8712](https://github.com/QwikDev/qwik/pull/8712))

  The VNode tree node, component detail entry, and render event shapes were declared
  three times: in the browser extension, in the devtools UI, and in the kit client
  bridge. They now live once in @qwik.dev/devtools/kit (protocol module) as
  DevtoolsVNodeTreeNode, DevtoolsComponentDetailEntry, and DevtoolsRenderEvent, and
  every consumer imports them from there.

- refactor(devtools): generate the extension VNode bridge from one shared source (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8713](https://github.com/QwikDev/qwik/pull/8713))

  The browser extension's `public/vnode-bridge.js` duplicated the VNode bridge logic
  (tree building, prop serialization, name normalization, DOM resolution, highlighting,
  component tree update posting) that the Vite plugin already owns via
  `__qwik_install_vnode_runtime__` / `createVNodeRuntime()`. It is now generated from
  that single canonical source by the extension build (alongside `devtools-hook.js`)
  and is no longer committed.

- refactor: drive the devtools sidebar from a configurable visible-tabs list (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8833](https://github.com/QwikDev/qwik/pull/8833))

- ✨ enhances the devtools package management experience by adding dependency inspection, search, install, update, and feedback flows to the Packages panel. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#8768](https://github.com/QwikDev/qwik/pull/8768))

## 0.3.0-beta.1

### Patch Changes

- refactor(devtools): single canonical devtools hook runtime (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8705](https://github.com/QwikDev/qwik/pull/8705))

  The browser extension's injected hook script (`devtools-hook.js`) is now generated
  from the same `__qwik_install_hook_runtime__` implementation used by the Vite plugin,
  instead of being a hand-maintained duplicate. A new build-time `@qwik.dev/devtools/codegen`
  entry exposes the runtime-string builders so both injection paths stay in sync.

- unify devtools global state access and update hook references (by [@JerryWu1234](https://github.com/JerryWu1234) in [#8702](https://github.com/QwikDev/qwik/pull/8702))

- Updated dependencies [[`d4f40ac`](https://github.com/QwikDev/qwik/commit/d4f40acdcbd437095c34255e878338f1e88f207b), [`48fb84e`](https://github.com/QwikDev/qwik/commit/48fb84ed0eb723ab6c6d32eb2b028e447a76ee0f), [`48fb84e`](https://github.com/QwikDev/qwik/commit/48fb84ed0eb723ab6c6d32eb2b028e447a76ee0f), [`a8509c1`](https://github.com/QwikDev/qwik/commit/a8509c1c312a3c9c9434b4050650970807ca38e0), [`e3cd979`](https://github.com/QwikDev/qwik/commit/e3cd979621d95485c7da29bb6c7322b63529bcfb), [`8e40b1f`](https://github.com/QwikDev/qwik/commit/8e40b1f0b004e65405328398f57033a4441becb1), [`48fb84e`](https://github.com/QwikDev/qwik/commit/48fb84ed0eb723ab6c6d32eb2b028e447a76ee0f), [`3b7f050`](https://github.com/QwikDev/qwik/commit/3b7f0508514c5544d532c53db99c27d3d2128990), [`e3cd979`](https://github.com/QwikDev/qwik/commit/e3cd979621d95485c7da29bb6c7322b63529bcfb), [`48fb84e`](https://github.com/QwikDev/qwik/commit/48fb84ed0eb723ab6c6d32eb2b028e447a76ee0f), [`e959cef`](https://github.com/QwikDev/qwik/commit/e959cefc1d938a44540cf4efd942563eb9c53b07), [`27505d5`](https://github.com/QwikDev/qwik/commit/27505d5081d90950af286521da05a5df9620887a), [`9ff0dd4`](https://github.com/QwikDev/qwik/commit/9ff0dd4351154098ae098358089a510ed2e0d770), [`e3cd979`](https://github.com/QwikDev/qwik/commit/e3cd979621d95485c7da29bb6c7322b63529bcfb), [`1722083`](https://github.com/QwikDev/qwik/commit/17220833f006925023c2dfd043388570c091a32d), [`021b4ce`](https://github.com/QwikDev/qwik/commit/021b4ce37073836527fab3fef324675f89005cc0), [`3dcb29b`](https://github.com/QwikDev/qwik/commit/3dcb29b803acb9de1d124fb1ac685b68d647be6c), [`129a54e`](https://github.com/QwikDev/qwik/commit/129a54ef5c90a82dc50ca05d430995baa3bf4255), [`48fb84e`](https://github.com/QwikDev/qwik/commit/48fb84ed0eb723ab6c6d32eb2b028e447a76ee0f)]:
  - @qwik.dev/core@2.0.0-beta.37
  - @qwik.dev/router@2.0.0-beta.37

## 0.3.0-beta.0

### Minor Changes

- fix(devtools): overlay exclude paths, server headers, and UI layering (by [@JerryWu1234](https://github.com/JerryWu1234) in [#8658](https://github.com/QwikDev/qwik/pull/8658))

### Patch Changes

- fix(devtools/ui): Preloads overflow, CodeBreak button placement, inline Qwik logo (by [@Aejkatappaja](https://github.com/Aejkatappaja) in [#8635](https://github.com/QwikDev/qwik/pull/8635))
  - Preloads panel: outer `overflow-hidden` clipped stat cards and prevented scroll when content exceeded the panel height. Switched to `overflow-auto` with `min-h-full` on the column stack so content scrolls on narrow or short panels.
  - CodeBreak StateParser: content container was missing the `flex` class, so the textarea pushed the Parse State button outside the card into the next grid row, overlapping the Parsed State header. Moved the button into the card header next to the title.
  - Inlined the Qwik logo as a local SVG component (`QwikLogo`) instead of fetching `https://qwik.dev/logos/qwik-logo.svg` via `<img src>`. Fixes the broken-image fallback in contexts where the remote fetch is blocked or unreachable.

- Updated dependencies [[`f58ad60`](https://github.com/QwikDev/qwik/commit/f58ad60517d41e6886a952e0e52c2219bc64fec8), [`9bd0927`](https://github.com/QwikDev/qwik/commit/9bd0927ac3ca09cb845512fae671778e6dfc4000), [`85905cf`](https://github.com/QwikDev/qwik/commit/85905cf2f08bc7b633eb2b376831e0180715dbef), [`612b3bd`](https://github.com/QwikDev/qwik/commit/612b3bd645b065eaf1469416c9096b44ae2daebb), [`d7d965d`](https://github.com/QwikDev/qwik/commit/d7d965d31e58dffd22d17e938847f7fb064e4cbc), [`b9cd8fa`](https://github.com/QwikDev/qwik/commit/b9cd8fa3def420b878023cb7d7ba2e840aa3d467), [`93cdfe5`](https://github.com/QwikDev/qwik/commit/93cdfe5e5d0c095197354ebaf69560dbfd46b9b1), [`bdbd076`](https://github.com/QwikDev/qwik/commit/bdbd07647760a230015a0fe3842b4a00e1a12094), [`5098ffa`](https://github.com/QwikDev/qwik/commit/5098ffa3899418570f7ceb18b27f6b38f22812db), [`6e00744`](https://github.com/QwikDev/qwik/commit/6e00744fb604943ee15930b57960954e74000299), [`ce6a45e`](https://github.com/QwikDev/qwik/commit/ce6a45e8908645a6ce0be3faa260824ae26c0fb7), [`137c075`](https://github.com/QwikDev/qwik/commit/137c0753547fb768524e00a19e972545b988d55c), [`5fd7174`](https://github.com/QwikDev/qwik/commit/5fd71742091c703d37c786a3650705a4d0af7221), [`23af20e`](https://github.com/QwikDev/qwik/commit/23af20e3662b060b2210eb8efa3d5857b9c752a9), [`42104ec`](https://github.com/QwikDev/qwik/commit/42104ec3d184955ea8f1299df3df20a3d754334f), [`0b52ad2`](https://github.com/QwikDev/qwik/commit/0b52ad2ec06d89779caabd9726eaa80118f08b1b)]:
  - @qwik.dev/core@2.0.0-beta.36
  - @qwik.dev/router@2.0.0-beta.36
