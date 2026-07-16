---
'@qwik.dev/router': major
---

BREAKING: Qwik Router no longer retrieves `q-data.json` files on every SPA navigation. You can remove any caching rules for these.

Instead, Qwik Router now retrieves `q-loader-${hash}.${manifestHash}.json` for RouteLoader data. You can specify expiry for each RouteLoader individually, and it is automatically used to set browser caching headers. The `manifestHash` ensures that when you build a new version of your app, the old cached data will be invalidated and the new data will be fetched.

The default expiry for RouteLoader data is 2 minutes, so that prefetching and caching of RouteLoader data is useful. You control this with the `expiry` option on each RouteLoader, and you can set it to `0` to disable caching.

Furthermore, any RouteLoader that has `expiry: 0` will be generated as a file during SSG, which allows SPA navigation to work even without a server.

Note: Be careful with caching for RouteLoaders that return user-specific data, especially regarding logout and CDN caching. Use low expiry times for these and use `eTag` to still allow caching benefits.
