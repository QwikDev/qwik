import { mergeConfig, defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Browser-targeted Vitest config for tests requiring DOM APIs
export default mergeConfig(
  baseConfig,
  defineConfig({
    esbuild: {
      platform: 'browser',
    },
    resolve: {
      conditions: ['browser'],
    },
    test: {
      environment: 'jsdom',
    },
  })
);
