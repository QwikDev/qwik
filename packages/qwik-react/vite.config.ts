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
        fileName: (format) => {
          return format === 'es' ? `index.qwik.mjs` : `index.qwik.cjs`;
        },
      },
      rollupOptions: {
        external: [
          '@emotion/server',
          '@emotion/cache',
          '@emotion/core',
          '@emotion/react',
          '@emotion/react/jsx-runtime',
          '@emotion/server/create-instance',
          'react/jsx-runtime',
          'react',
          'react-dom/client',
          'react-dom/server',
        ],
        output: {
          chunkFileNames: '[name]-[hash].js',
        },
      },
    },
    plugins: [
      qwikVite(/* VITE_QWIK */),
      /* VITE_PLUGINS */
    ],
  };
});
