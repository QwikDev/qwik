---
'@qwik.dev/core': minor
---

FEAT: Add `<Suspense />` component with fallback after timeout. If the `children` take too long to render, the `fallback` content will be shown until the `children` are ready.

On SSR, the `children` are always rendered, as if `<Suspense />` were not present. However, this will be used to indicate out-of-order boundaries for streaming SSR in the future.

```tsx
  <Suspense fallback={<div>Loading...</div>} timeout={50}>
    <NestedComponent />
  </Suspense>
```

`showStale` can be used on client updates to keep the last resolved children visible while also
showing the fallback:

```tsx
  <Suspense fallback={<div>Refreshing…</div>} timeout={50} showStale>
    <NestedComponent />
  </Suspense>
```

This is currently marked experimental and you have to enable it by passing
`experimental: ['suspense']` to the qwikVite plugin.
