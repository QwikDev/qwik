import { qwikVite } from '@builder.io/qwik/optimizer';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig, configDefaults } from 'vitest/config';

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
    include: ['**/*.spec.?(c|m)[jt]s?(x)', '**/*.unit.?(c|m)[jt]s?(x)', '!qwik/dist', '!*/lib'],
    setupFiles: ['./vitest-setup.ts'],
  },
});
