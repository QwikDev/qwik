import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  tsconfig: './tsconfig.json',
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
