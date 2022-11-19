import { cloudflarePagesAdaptor } from '@builder.io/qwik-city/adaptors/cloudflare-pages/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  console.log(process.env.CF_PAGES_BRANCH);
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.cloudflare-pages.tsx', '@qwik-city-plan'],
      },
    },
    plugins: [
      cloudflarePagesAdaptor({
        staticGenerate: {
          origin:
            (process.env.CF_PAGES_BRANCH !== 'main' ? process.env.CF_PAGES_URL : null) ??
            'https://qwik.builder.io',
        },
      }),
    ],
  };
});
