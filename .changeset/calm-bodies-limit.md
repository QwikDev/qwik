---
'@builder.io/qwik-city': patch
---

fix: limit request bodies to 10 MiB by default in the Node, Deno, Bun, Cloudflare Pages, Netlify Edge and Vercel Edge adapters (and AWS Lambda / Firebase through Node); configurable with the new `requestBodyLimit` option
