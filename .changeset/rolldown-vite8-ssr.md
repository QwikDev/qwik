---
'@qwik.dev/core': minor
---

feat: add Rolldown/Vite 8 SSR build support

Detect Rolldown via `this.meta.rolldownVersion` and use `codeSplitting` instead of `manualChunks`. Maintain `clientSegments` Map as workaround for missing `module.meta`. Preserve raw capture expressions for `.w()` calls when bundler inlines captures. Add `rolldownOptions` input detection alongside `rollupOptions`.
