import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  target: 'esnext',
  format: ['esm'],
  external: ['vite', 'vite-plugin-inspect', '@qwik.dev/core'],
  dts: true,
  shims: true,
  tsconfig: './tsconfig.json',
});
