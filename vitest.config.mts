import { qwikVite } from '@qwik.dev/core/optimizer';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { compiledStringPlugin } from './scripts/compiled-string-plugin';

export default defineConfig({
  plugins: [
    compiledStringPlugin(),
    qwikVite({
      debug: !true,
      srcDir: `./packages/qwik/src`,
    }),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ],
  test: {
    root: 'packages',
    include: ['**/*.spec.?(c|m)[jt]s?(x)', '**/*.unit.?(c|m)[jt]s?(x)', '!qwik/dist', '!*/lib'],
    setupFiles: ['./vitest-setup.ts'],
  },
});
