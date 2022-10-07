import baseConfig from '../../vite.config';
import { extendConfig } from '../cloudflare-pages/vite.config';

export default extendConfig(baseConfig, () => {
  return {
    ssr: {
      target: 'node',
      format: 'cjs',
    },
    build: {
      ssr: 'src/entry.static.tsx',
      outDir: 'server',
    },
  };
});
