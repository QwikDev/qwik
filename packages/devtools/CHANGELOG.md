# @qwik.dev/devtools

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
