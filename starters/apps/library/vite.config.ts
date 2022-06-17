import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
/* VITE_IMPORTS */

export default defineConfig(() => {
  return {
    /* VITE_CONFIG */
    build: {
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.${format}.qwik.js`,
      },
    },
    plugins: [
      qwikVite(/* VITE_QWIK */),
      /* VITE_PLUGINS */
    ],
  };
});
