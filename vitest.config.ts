import { qwikVite } from '@qwik.dev/core/optimizer';
import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const renderTests = [
  'packages/qwik/src/core/tests/*.spec.tsx',
  'packages/qwik/src/testing/testing.unit.tsx',
  'packages/qwik-router/src/runtime/src/link-component.unit.tsx',
];
const renderProject = (testTarget: 'csr' | 'resume' | 'ssr'): TestProjectInlineConfiguration => ({
  plugins: [
    qwikVite({
      srcDir: fromRoot('.'),
      testTarget,
      devTools: { hmr: false, imageDevTools: false },
      experimental: ['each', 'suspense'],
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  resolve: {
    alias: [
      { find: /^@qwik.dev\/core$/, replacement: fromRoot('./packages/qwik/src/core/index.ts') },
      {
        find: /^@qwik.dev\/core\/internal$/,
        replacement: fromRoot('./packages/qwik/src/core/index.ts'),
      },
      {
        find: /^@qwik.dev\/core\/server$/,
        replacement: fromRoot('./packages/qwik/src/server/index.ts'),
      },
      {
        find: /^@qwik.dev\/core\/testing$/,
        replacement: fromRoot('./packages/qwik/src/testing/index.ts'),
      },
    ],
  },
  test: {
    name: testTarget,
    root: fromRoot('.'),
    include: [
      ...(testTarget === 'ssr' ? ['packages/qwik/src/testing/testing.unit.tsx'] : renderTests),
      ...(testTarget === 'resume' ? ['packages/qwik/src/testing/resume-session.unit.tsx'] : []),
    ],
    setupFiles: [fromRoot('./vitest-setup.ts')],
    testTimeout: 10000,
  },
});

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
      '!qwik/src/core/tests/*.spec.tsx',
      '!qwik/src/testing/testing.unit.tsx',
      '!qwik-router/src/runtime/src/link-component.unit.tsx',
      '!qwik/src/testing/resume-session.unit.tsx',
    ],
    setupFiles: [fromRoot('./vitest-setup.ts')],
    projects: ['..', renderProject('csr'), renderProject('resume'), renderProject('ssr')],
    testTimeout: 10000,
  },
});
