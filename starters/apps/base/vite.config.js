import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'q-[hash].js',
        assetFileNames: 'q-[hash].[ext]',
      },
    },
  },
  ssr: {
    noExternal: true,
  },
  plugins: [
    qwikVite({
      srcDir: resolve('./src'),
      entryStrategy: {
        type: 'single',
      },
    }),
  ],
});
