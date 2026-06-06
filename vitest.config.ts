import { qwikVite } from '@qwik.dev/core/optimizer';
import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const renderTestDir = fromRoot('./packages/qwik/src/core/vdomless/tests/');

export default defineConfig({
  // temporary fix to allow tests to run without the kit package, remove this once we have a proper kit package
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
      experimental: ['each', 'suspense'],
      fileFilter: (id) => !id.includes(renderTestDir),
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  test: {
    root: fromRoot('./packages'),
    include: [
      '**/*.spec.*',
      '**/*.unit.*',
      '!*/(lib|dist|build|server|target)/**',
      '!**/node_modules/**',
    ],
    setupFiles: [fromRoot('./vitest-setup.ts')],
    projects: ['..'],
    testTimeout: 10000,
  },
});
