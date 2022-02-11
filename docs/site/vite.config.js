import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import mdPlugin from 'vite-plugin-markdown';

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
      symbolsOutput: (data) => {
        outputJSON('./server/q-symbols.json', data);
      },
    }),
    mdPlugin({
      mode: ['html'],
    }),
  ],
});

async function outputJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}
