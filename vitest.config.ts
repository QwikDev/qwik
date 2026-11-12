import { qwikVite } from '@qwik.dev/core/optimizer';
import { compileCoreQrls } from './scripts/core-library-qrls.ts';
import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Vite ids use forward slashes on every platform.
const coreSrcDir = fromRoot('./packages/qwik/src/core').replaceAll('\\', '/');
const isCoreSource = (id: string) =>
  id.startsWith(coreSrcDir + '/') && !/\.(unit|spec)\.tsx?|[/\\](tests|bench)[/\\]/.test(id);

export default defineConfig({
  // temporary fix to allow tests to run without the kit package, remove this once we have a proper kit package
  resolve: {
    alias: {
      '@qwik.dev/devtools/kit': fromRoot('./packages/devtools/kit/src/index.ts'),
    },
  },
  plugins: [
    {
      name: 'core-library-qrls',
      enforce: 'pre',
      async transform(code, id) {
        if (!isCoreSource(id)) {
          return null;
        }
        const { transformModule } = await import('./packages/qwik/dist/ts-optimizer.mjs');
        return compileCoreQrls(transformModule, coreSrcDir, id, code);
      },
    },
    qwikVite({
      tsOptimizer: true,
      debug: !true,
      srcDir: fromRoot('./packages/qwik/src'),
      devTools: { hmr: false },
      experimental: ['each', 'show', 'pendingBoundary', 'catchBoundary'],
    }),
    tsconfigPaths({ ignoreConfigErrors: true, loose: true }),
  ],
  test: {
    root: fromRoot('./packages'),
    include: [
      '**/*.spec.*',
      '**/*.unit.*',
      '!*/(lib|dist|build|server|target)/**',
      '!**/node_modules/**',
      '!**/__snapshots__/**',
    ],
    setupFiles: [fromRoot('./vitest-setup.ts')],
    projects: ['..'],
    testTimeout: 10000,
  },
});
