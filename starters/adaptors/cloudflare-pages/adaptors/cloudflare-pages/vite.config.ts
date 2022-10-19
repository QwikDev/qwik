import { cloudflarePagesAdaptor } from '@builder.io/qwik-city/adaptors/cloudflare-pages/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.cloudflare-pages.tsx', 'src/entry.ssr.tsx', '@qwik-city-plan'],
      },
    },
    ssr: {
      target: 'webworker',
      noExternal: true,
    },
    plugins: [
      cloudflarePagesAdaptor({
        staticGenerate: true,
      }),
    ],
  };
});
