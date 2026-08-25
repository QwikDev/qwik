---
'@qwik.dev/router': patch
---

fix: preserve route params on loader request event views scoped by `search`

`routeLoader$` with `{ search: [] }` (or an explicit allowlist, or under
`strictLoaders: true`) on a route with a dynamic segment (e.g.
`[lang]/index.tsx`) previously received an empty `params` object whenever
the request URL carried a query string — even though the same request
without a query string resolved `params` correctly. Route params come from
matching the pathname, not the query string, so they are now preserved on
the loader's scoped request event view.
