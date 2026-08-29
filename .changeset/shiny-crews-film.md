---
'@builder.io/qwik-city': minor
---

✨ **(EXPERIMENTAL)** standardSchema$ validator (by [@nothendev](https://github.com/nothendev) in [#8840](https://github.com/QwikDev/qwik/pull/8840))

To use it, you need to pass `experimental: ['standardSchema']` as an option to the `qwikVite` plugin as such:

```ts
// vite.config.ts

export default defineConfig(({ command, mode }): UserConfig => {
  return {
    plugins: [
      // ... other plugins like qwikCity() etc
      qwikVite({
        experimental: ['standardSchema']
        // ... other options
      }),

    ],
    // ... rest of the config
  };
}
```

Then pass any [Standard Schema compatible](https://standardschema.dev) validator into `standardSchema$`:

```ts
import { type } from 'arktype';
import { routeAction$, standardSchema$ } from '@builder.io/qwik-city';

export const useLogin = routeAction$(
  async ({ username, password }, ev) => {
    // ... use the type-inferred { username: string, password: string }
  },
  standardSchema$(
    type({
      username: 'string',
      password: 'string > 8',
    })
  )
);
```
