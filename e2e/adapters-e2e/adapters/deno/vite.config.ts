import { denoServerAdapter } from '@qwik.dev/router/adapters/deno-server/vite';
import { extendConfig } from '@qwik.dev/router/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.deno.tsx'],
      },
    },
    plugins: [
      denoServerAdapter({
        name: 'deno',
        // Prerender pages and a static loader sidecar for serving coverage.
        ssg: { include: ['/profile/', '/loaders/*'] },
      }),
    ],
  };
});
