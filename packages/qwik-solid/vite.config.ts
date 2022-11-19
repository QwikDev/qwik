import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: [
          'solid-js',
          'solid-js/web',
        ],
      },
    },
    plugins: [qwikVite()],
  };
});
