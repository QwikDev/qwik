---
'@qwik.dev/core': patch
---

fix: `transformError` projections with unserializable fields redact to the generic error instead of breaking SSR serialization
