---
'@qwik.dev/router': patch
---

fix: the SSG adapter no longer warns "Qwik Router SSG was skipped" on builds that prerender, and passes the server entries to the adapter's `generate()`
