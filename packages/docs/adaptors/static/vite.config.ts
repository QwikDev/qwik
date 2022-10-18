import { cloudflarePages } from '@builder.io/qwik-city/adaptors/cloudflare-pages/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.ssr.tsx', '@qwik-city-plan'],
      },
    },
    plugins: [
      cloudflarePages({
        staticGenerate: true,
      }),
    ],
  };
});
