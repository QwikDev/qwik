import { cloudflarePages } from '@builder.io/qwik-city/adaptors/cloudflare-pages/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    ssr: {
      target: 'webworker',
      noExternal: true,
    },
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.cloudflare-pages.tsx', 'src/entry.ssr.tsx'],
      },
      outDir: 'server',
    },
    plugins: [cloudflarePages()],
  };
});
