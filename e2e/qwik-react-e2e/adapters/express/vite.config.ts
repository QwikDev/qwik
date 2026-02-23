import { nodeServerAdapter } from '@qwik.dev/router/adapters/node-server/vite';
import { extendConfig } from '@qwik.dev/router/vite';
import baseConfig from '../../vite.config';

// @ts-expect-error - incompatible types between vite 7 and vite 8-beta
export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.express.tsx'],
      },
    },
    plugins: [nodeServerAdapter({ name: 'express' })],
  };
});
