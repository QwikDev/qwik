---
'@builder.io/qwik-city': patch
---

FIX: redirects no longer take their parent layout's Cache-Control value by default and are instead set to `no-store`. This prevents issues in redirection logic. We might introduce another API to enable caching redirects in the future.
