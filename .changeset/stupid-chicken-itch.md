---
'@builder.io/qwik-city': minor
---

FEAT: **(EXPERIMENTAL)** `valibot$` validator and a fix for `zod$` types.

To use it, you need to pass `experimental: ['valibot']` as an option to the `qwikVite` plugin as such:

```ts
// vite.config.ts

export default defineConfig(({ command, mode }): UserConfig => {
  return {
    plugins: [
      // ... other plugins like qwikCity() etc
      qwikVite({
        experimental: ['valibot']
        // ... other options
      }),

    ],
    // ... rest of the config
  };
}

```
