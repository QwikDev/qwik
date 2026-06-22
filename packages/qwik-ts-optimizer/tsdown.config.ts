import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: true,
  sourcemap: true,
  clean: true,
  // `.js`/`.d.ts` (not node-default `.mjs`) to match the package's exports map.
  fixedExtension: false,
})
