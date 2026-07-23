import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../../../adapters-e2e/vite.config';

export default defineConfig(async (env) => {
  const resolvedBase = typeof baseConfig === 'function' ? await baseConfig(env) : baseConfig;

  return mergeConfig(resolvedBase, {
    build: {
      assetsDir: 'assets-dir',
    },
  });
});
