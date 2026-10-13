import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@qwik.dev/devtools/kit': fileURLToPath(
        new URL('../devtools/kit/src/index.ts', import.meta.url)
      ),
    },
  },
  test: { include: ['src/*.unit.ts', 'src/*.test.ts'], testTimeout: 15000 },
});
