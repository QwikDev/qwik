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
    },
    ssr: {
      noExternal: ['@algolia/autocomplete-shared', '@algolia/autocomplete-core', 'prismjs'],
    },
    plugins: [
      cloudflarePagesAdaptor({
        staticGenerate: true,
      }),
    ],
  };
});
