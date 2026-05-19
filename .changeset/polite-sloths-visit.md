---
'@qwik.dev/router': minor
---

fix: the SSR internal build imports `@qwik-router-not-found-paths` and `@qwik-router-static-paths` are no longer used. Instead, the data is embedded directly. This might be a breaking change for some users that forked an adapter, in that case just remove the imports.
