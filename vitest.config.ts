import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  test: {
    include: [
      'packages/**/*.unit.?(c|m)[jt]s?(x)',
      // Rust build cache
      '!packages/qwik/**/target',
      '!packages/qwik/dist',
      '!packages/*/lib',
      '!starters',
      '!**/node_modules',
      '!dist-dev',
    ],
    setupFiles: ['./vitest-setup.ts'],
  },
});
