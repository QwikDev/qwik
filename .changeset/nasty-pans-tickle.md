---
'@qwik.dev/router': major
---

BREAKING: Qwik Router no longer retrieves `q-data.json` files on every SPA navigation. You can remove any caching rules for these.

Instead, Qwik Router now retrieves `q-loader-${hash}.${manifestHash}.json` for RouteLoader data. You can specify expiry for each RouteLoader individually, and it is automatically used to set browser caching headers. The `manifestHash` ensures that when you build a new version of your app, the old cached data will be invalidated and the new data will be fetched.

The default expiry for RouteLoader data is 5 minutes, so that prefetching and caching of RouteLoader data is enabled by default. You can set `expiry: 0` to mark a RouteLoader as never expiring.

Furthermore, any RouteLoader that has `expiry: 0` will be generated as a file during SSG, which allows SPA navigation to work even without a server.

Note: Be careful with caching for RouteLoaders that return user-specific data, especially regarding logout and CDN caching.
