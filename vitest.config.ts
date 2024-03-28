import { defineConfig } from 'vitest/config';
import { qwikVite } from '@builder.io/qwik/optimizer';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    qwikVite({
      // debug: true,
      srcDir: `./packages/qwik/src`,
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  test: {
    include: ['packages/**/*.unit.?(c|m)[jt]s?(x)'],
    setupFiles: ['./vitest-setup.ts'],
  },
});
