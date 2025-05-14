---
'@builder.io/qwik': minor
---

FEAT: Major improvements to prefetching with automatic bundle preloading

- This removes the need for service workers, and instead utilize `modulepreload` link tags for better browser integration.
- Improves initial load performance by including dynamic imports in the prefetch
- Reduces complexity while maintaining similar (and even better) functionality
- Enables some preloading capabilities in dev mode (SSR result only)
- Includes path-to-bundle mapping in bundle graph (this improves the experience using the `<Link>` component, AKA "single page app" mode)
- Server now has built-in manifest support (so no need to pass `manifest` around)
- Moves insights-related build code to insights plugin

---

⚠️ **ATTENTION:**

- **Keep** your service worker code as is (either `<ServiceWorkerRegister/>` or `<PrefetchServiceWorker/>`).
- **Configure** your server to provide long caching headers.

Service Worker:

This new implementation will use it to uninstall the current service worker to reduce the unnecessary duplication.

The builtin service workers components are deprecated but still exist for backwards compatibility.

Caching Headers:

The files under build/ and assets/ are named with their content hash and may therefore be cached indefinitely. Typically you should serve `build/*` and `assets/*` with `Cache-Control: public, max-age=31536000, immutable`.

However, if you changed the rollup configuration for output filenames, you will have to adjust the caching configuration accordingly.

---

You can configure the preload behavior in your SSR configuration:

```ts
// entry.ssr.ts
export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    preload: {
      // Enable debug logging for preload operations
      debug: true,
      // Maximum simultaneous preload links
      maxIdlePreloads: 5,
      // Minimum probability threshold for preloading
      preloadProbability: 0.25
      // ...and more, see the type JSDoc on hover
    },
    ...opts,
  });
}
```

For legacy apps that still need service worker functionality, you can add it back using:

```bash
npm run qwik add service-worker
```

This will add a basic service worker setup that you can customize for specific caching strategies, offline support, or other PWA features beyond just prefetching.
