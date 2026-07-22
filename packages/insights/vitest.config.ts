import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ['**/*.unit.?(c|m)[jt]s?(x)'],
    setupFiles: ['../../vitest-setup.ts'],
  },
});
