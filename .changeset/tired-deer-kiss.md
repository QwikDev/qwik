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
