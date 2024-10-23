---
'@builder.io/qwik-city': patch
---

Add support for vercel's serverless functions, including the associated adapters and middleware for Vercel functions. For this to occur a refactor of the codebase was required in order to support both edge and serverless function runtimes.

## Vercel Edge

To use vercel edge functions the same vite entry file is used, the only difference being `middleware/vercel/edge` rather than `middleware/vercel-edge`.

> Note: `middleware/vercel-edge` is still supported, it is just that now you can use `middleware/vercel/edge` going forward.

```ts
import { createQwikCity, type PlatformVercel } from '@builder.io/qwik-city/middleware/vercel/edge';
```

In terms of changes, the most significant change is the `vite.config.ts` file (though the change is rather minor).

```ts
import {
  vercelEdgeAdapter,
  FUNCTION_DIRECTORY,
} from '@builder.io/qwik-city/adapters/vercel/edge/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.vercel-edge.tsx', '@qwik-city-plan'],
      },
      outDir: `.vercel/output/functions/${FUNCTION_DIRECTORY}.func`,
    },
    plugins: [vercelEdgeAdapter()],
  };
});
```

The `FUNCTION_DIRECTORY` constant is now used to simplify the function output directory for both vercel edge and serverless functions.

> Note: the vite adapter is `adapters/vercel/edge/vite` though `adapters/vercel-edge/vite` is still supported.

## Vercel Serverless

To use vercel serverless functions the vite entry file is used very similar, the only difference being `middleware/vercel/serverless`.

> Note: unlike `middleware/vercel-edge` there is no `middleware/vercel-serverless` you have to use `middleware/vercel/serverless` going forward.

```ts
import {
  createQwikCity,
  type PlatformVercelServerless,
} from '@builder.io/qwik-city/middleware/vercel/serverless';
```

Similar, to the vercel edge adapters, in terms of changes the most significant change is the `vite.config.ts` file.

```ts
import {
  vercelServerlessAdapter,
  FUNCTION_DIRECTORY,
} from '@builder.io/qwik-city/adapters/vercel/serverless/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.vercel-serverless.tsx', '@qwik-city-plan'],
      },
      outDir: `.vercel/output/functions/${FUNCTION_DIRECTORY}.func`,
    },
    plugins: [vercelServerlessAdapter()],
  };
});
```

> Note: unlike the `adapters/vercel-edge/vite` vite adapter, only the `adapters/vercel/serverless/vite` is supported.
