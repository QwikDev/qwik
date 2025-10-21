import { qwikVite } from '@qwik.dev/core/optimizer';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    qwikVite({
      debug: !true,
      srcDir: `./packages/qwik/src`,
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  test: {
    root: 'packages',
    include: [
      '**/*.spec.?(c|m)[jt]s?(x)',
      '**/*.unit.?(c|m)[jt]s?(x)',
      '!*/(lib|dist|build|server|target)/**',
      '!**/node_modules/**',
    ],
    setupFiles: ['../vitest-setup.ts'],
    projects: ['..'],
  },
});
