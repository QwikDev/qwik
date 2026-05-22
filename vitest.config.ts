import { qwikVite } from '@qwik.dev/core/optimizer';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // temporary fix to allow tests to run without the kit package, remove this once we have a proper kit package
  resolve: {
    alias: {
      '@qwik.dev/devtools/kit': new URL('./packages/devtools/kit/src/index.ts', import.meta.url)
        .pathname,
    },
  },
  plugins: [
    qwikVite({
      debug: !true,
      srcDir: `./packages/qwik/src`,
      devTools: { hmr: false },
      experimental: ['each', 'suspense'],
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
