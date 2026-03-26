import { qwikVite } from '@qwik.dev/core/optimizer';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    qwikVite({
      debug: !true,
      srcDir: `./packages/qwik/src`,
      devTools: { hmr: false },
      experimental: ['each'],
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  test: {
    root: 'packages',
    include: [
      '**/*.spec.*',
      '**/*.unit.*',
      '!*/(lib|dist|build|server|target)/**',
      '!**/node_modules/**',
    ],
    setupFiles: ['../vitest-setup.ts'],
    projects: ['..'],
    testTimeout: 10000,
  },
});
