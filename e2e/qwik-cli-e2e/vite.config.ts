import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// if we're running in github CI
if (process.env.CI) {
  // Workaround for npm/pnpm crashing in scaffoldQwikProject because "name is too long"
  const testPath = resolve(process.cwd(), 'e2e-test-tmp');
  mkdirSync(testPath);
  process.env.TEMP_E2E_PATH = testPath;
}

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
