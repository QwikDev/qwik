import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    ssr: {
      target: 'node',
      format: 'cjs',
    },
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.static.tsx', 'src/entry.ssr.tsx'],
      },
      outDir: 'server',
    },
  };
});
