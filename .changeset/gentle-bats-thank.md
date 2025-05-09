---
'@builder.io/qwik-city': minor
---

FIX: qwik-city no longer forces `q-data.json` downloads, instead relying on the cache headers. This means that you have to make sure your `q-data.json` is served with `Cache-Control` headers that suit you. That file contains all the information about the route and is read for each qwik-city navigation. By default the data is cached for one hour.
