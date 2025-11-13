import { nodeServerAdapter } from '@builder.io/qwik-city/adapters/node-server/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../client/base.vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.express.tsx', '@qwik-city-plan'],
      },
    },
    plugins: [nodeServerAdapter({ name: 'express' })],
  };
});
