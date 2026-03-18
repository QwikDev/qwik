import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@qwik.dev/core/jsx-dev-runtime',
        replacement: fileURLToPath(
          new URL('./packages/qwik/src/core/shared/jsx/jsx-runtime.ts', import.meta.url)
        ),
      },
      {
        find: '@qwik.dev/core/jsx-runtime',
        replacement: fileURLToPath(
          new URL('./packages/qwik/src/core/shared/jsx/jsx-runtime.ts', import.meta.url)
        ),
      },
      {
        find: '@qwik.dev/core/build',
        replacement: fileURLToPath(
          new URL('./packages/qwik/src/build/index.dev.ts', import.meta.url)
        ),
      },
      {
        find: '@qwik.dev/core/preloader',
        replacement: fileURLToPath(
          new URL('./packages/qwik/src/core/bench/preloader-stub.ts', import.meta.url)
        ),
      },
      {
        find: '@qwik.dev/core/internal',
        replacement: fileURLToPath(
          new URL('./packages/qwik/src/core/internal.ts', import.meta.url)
        ),
      },
      {
        find: '@qwik.dev/core',
        replacement: fileURLToPath(new URL('./packages/qwik/src/core/index.ts', import.meta.url)),
      },
      {
        find: '@qwik-client-manifest',
        replacement: fileURLToPath(
          new URL('./packages/qwik/src/core/bench/manifest-stub.ts', import.meta.url)
        ),
      },
    ],
  },
  test: {
    root: 'packages',
    include: ['**/*.bench.?(c|m)[jt]s?(x)'],
    testTimeout: 120000,
  },
  benchmark: {
    include: ['**/*.bench.?(c|m)[jt]s?(x)'],
  },
});
