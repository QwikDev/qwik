import { defineConfig } from 'tsdown';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: [resolve(root, 'src/index.ts')],
  clean: true,
  outDir: resolve(root, 'dist'),
  target: 'esnext',
  format: ['esm'],
  external: ['vite', 'vite-plugin-inspect', '@qwik.dev/core', '@qwik.dev/devtools/kit'],
  dts: true,
  shims: true,
  tsconfig: resolve(root, 'tsconfig.json'),
});
