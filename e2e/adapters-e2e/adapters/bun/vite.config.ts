import { bunServerAdapter } from '@qwik.dev/router/adapters/bun-server/vite';
import { extendConfig } from '@qwik.dev/router/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.bun.tsx'],
      },
    },
    plugins: [bunServerAdapter({ name: 'bun' })],
  };
});
