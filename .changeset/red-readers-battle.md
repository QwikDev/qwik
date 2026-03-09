---
'@qwik.dev/router': minor
---

FEAT: eTag and in-memory cache for SSR pages. You can define an `eTag` property on your page modules, which will be used to generate an ETag header for the response, and which is checked before rendering the page, returning 304 if possible.
If you define a `cacheKey` function on your page module, it will be used to generate a cache key for the page, which is used to store the rendered HTML in an in-memory cache. This allows for faster responses for pages that are expensive to render and do not change often. The cache can be cleared using the `clearSsrCache` function from the request handler middleware.
