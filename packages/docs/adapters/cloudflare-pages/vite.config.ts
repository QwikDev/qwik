import { cloudflarePagesAdapter } from '@qwik.dev/router/adapters/cloudflare-pages/vite';
import { extendConfig } from '@qwik.dev/router/vite';
import baseConfig from '../../vite.config';

// @ts-expect-error - incompatible types between vite 7 and vite 8-beta
export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.cloudflare-pages.tsx'],
      },
      minify: false,
    },
    plugins: [
      cloudflarePagesAdapter({
        ssg: {
          include: ['/', '/*'],
          exclude: ['/demo/*', '/shop/*'],
          origin:
            (process.env.CF_PAGES_BRANCH !== 'main' ? process.env.CF_PAGES_URL : null) ??
            'https://qwik.dev',
        },
      }),
    ],
  };
});
