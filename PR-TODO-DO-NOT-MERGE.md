# TODO

- fix failing e2e tests
- dev mode support for q-loader-data and other things that read the manifest for qwik-router-config
- remove every q-data.json load
- implement eTag option for loaders
- implement expires option for loaders
  - changes the cache-control max-age
  - use on client side to determine if the data is stale before fetching
  - during SSR, store page create time and loader expires deltas
- cache q-loader-data responses in the browser
