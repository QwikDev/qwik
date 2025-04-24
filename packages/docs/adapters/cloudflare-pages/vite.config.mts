import { cloudflarePagesAdapter } from '@builder.io/qwik-city/adapters/cloudflare-pages/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
// @ts-ignore
import baseConfig from '../../vite.config.mts';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.cloudflare-pages.tsx', '@qwik-city-plan'],
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
            'https://qwik.builder.io',
        },
      }),
    ],
  };
});
