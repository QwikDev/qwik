import { qwikVite } from '@qwik.dev/core/optimizer';
import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Mirrors vitest.config.ts WITHOUT the `errorBoundary` flag: pins the flag-off runtime path.
export default defineConfig({
  resolve: {
    alias: {
      '@qwik.dev/devtools/kit': fromRoot('./packages/devtools/kit/src/index.ts'),
    },
  },
  plugins: [
    qwikVite({
      debug: !true,
      srcDir: fromRoot('./packages/qwik/src'),
      devTools: { hmr: false },
      experimental: ['each', 'show', 'suspense'],
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  test: {
    name: 'flag-off',
    root: fromRoot('./packages'),
    include: ['**/*.flag-off.spec.*', '!**/node_modules/**'],
    setupFiles: [fromRoot('./vitest-setup.ts')],
    testTimeout: 10000,
  },
});
