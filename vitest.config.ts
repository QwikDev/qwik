import { qwikVite } from '@builder.io/qwik/optimizer';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    qwikVite({
      // debug: true,
      srcDir: `./packages/qwik/src`,
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  test: {
    include: [
      'packages/**/*.spec.?(c|m)[jt]s?(x)',
      'packages/**/*.unit.?(c|m)[jt]s?(x)',
      '!packages/qwik/dist',
      '!packages/*/lib',
      '!starters',
      '!**/node_modules',
      '!dist-dev',
    ],
    setupFiles: ['./vitest-setup.ts'],
  },
});
