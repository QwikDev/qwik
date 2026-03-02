---
'@builder.io/qwik': patch
'@builder.io/qwik-city': patch
---

FIX: support Deno as package manager for production builds. The Vite plugin now recognizes Deno as a Node-compatible runtime for manifest passing, and SSG delegates to the Node implementation instead of stubbing out.
