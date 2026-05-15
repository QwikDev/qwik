---
'@qwik.dev/devtools': patch
---

fix(devtools/ui): Preloads overflow, CodeBreak button placement, inline Qwik logo

- Preloads panel: outer `overflow-hidden` clipped stat cards and prevented scroll when content exceeded the panel height. Switched to `overflow-auto` with `min-h-full` on the column stack so content scrolls on narrow or short panels.
- CodeBreak StateParser: content container was missing the `flex` class, so the textarea pushed the Parse State button outside the card into the next grid row, overlapping the Parsed State header. Moved the button into the card header next to the title.
- Inlined the Qwik logo as a local SVG component (`QwikLogo`) instead of fetching `https://qwik.dev/logos/qwik-logo.svg` via `<img src>`. Fixes the broken-image fallback in contexts where the remote fetch is blocked or unreachable.
