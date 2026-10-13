import { cloudflarePagesAdapter } from '@qwik.dev/router/adapters/cloudflare-pages/vite';
import { extendConfig } from '@qwik.dev/router/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rolldownOptions: {
        input: ['src/entry.cloudflare-pages.tsx'],
      },
      minify: false,
    },
    plugins: [
      cloudflarePagesAdapter({
        ssg: {
          include: ['/', '/*'],
          exclude: ['/demo/*', '/shop/*'],
          // v2 docs are served from next.qwik.dev; qwik.dev still serves v1.
          origin: process.env.QWIK_DOCS_ORIGIN || 'https://next.qwik.dev',
        },
      }),
    ],
  };
});
