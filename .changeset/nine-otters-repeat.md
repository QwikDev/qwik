---
'@qwik.dev/core': major
---

`qwik-labs` package has been removed in favor of experimental features.
So the "Insights" vite plugin and components have been moved to core as an experimental feature.

In order to use it, you need to -

**1)** add `insights` to the experimental array in `vite.config.ts`:

```ts
qwikVite({
  experimental: ['insights']
}),
```

**2)** Import and use the `qwikInsights` vite plugin from `@qwik.dev/core/insights/vite`:

```ts
import { qwikInsights } from '@qwik.dev/core/insights/vite';
```

**3)** import the `<Insights>` component from `@qwik.dev/core/insights` and use it in your `root.tsx` file: :

```tsx title="root.tsx"
import { Insights } from '@qwik.dev/core/insights';

// ...rest of root.tsx file

return (
  <Insights publicApiKey="..." postUrl="..." />
  /* ...qwik app */
);
```
