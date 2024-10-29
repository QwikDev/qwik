import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ ignoreConfigErrors: true, root: '../../' })],
  test: {
    include: ['./tests/*.spec.?(c|m)[jt]s?(x)'],
    setupFiles: ['./utils/setup.ts'],
    // Run only one test at a time to avoid potential conflicts.
    // These tests interact directly with the filesystem and/or run processes on localhost,
    // which can lead to issues if multiple tests are executed simultaneously
    fileParallelism: false,
  },
});
