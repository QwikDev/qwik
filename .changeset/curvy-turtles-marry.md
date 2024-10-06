---
'@builder.io/qwik-city': patch
---

Added experimental feature `noSPA`. This disables history patching, slightly reducing code size and startup time. Use this when your application is MPA only, meaning you don't use the Link component. To enable this, add it to the `experimental` array of the `qwikVite` plugin (not the `qwikCity` plugin).
