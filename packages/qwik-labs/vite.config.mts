import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';
import dtsPlugin from 'vite-plugin-dts';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2021',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
    },
    plugins: [qwikVite(), dtsPlugin()],
  };
});
