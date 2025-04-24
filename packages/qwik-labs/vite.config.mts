import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
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
      rollupOptions: {
        external: ['zod'],
      },
    },
    plugins: [qwikVite(), dtsPlugin()],
  };
});
