---
'@builder.io/qwik': patch
---

FIX: SSR was missing some places with nonce for CSP. Now CSP should work even when strict-dynamic
