import { staticAdaptor } from '@builder.io/qwik-city/adaptors/static/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['@qwik-city-plan'],
      },
    },
    plugins: [
      staticAdaptor({
        origin: 'https://yoursite.qwik.dev',
      }),
    ],
  };
});
