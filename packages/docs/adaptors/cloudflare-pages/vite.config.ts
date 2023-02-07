import { cloudflarePagesAdaptor } from '@builder.io/qwik-city/adaptors/cloudflare-pages/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

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
      cloudflarePagesAdaptor({
        ssg: {
          include: ['/*'],
          exclude: ['/'],
          origin:
            (process.env.CF_PAGES_BRANCH !== 'main' ? process.env.CF_PAGES_URL : null) ??
            'https://qwik.builder.io',
        },
      }),
    ],
  };
});
