import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { dirname, resolve, join } from 'path';
import { writeFile, mkdir } from 'fs/promises';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'q-[hash].js',
        assetFileNames: 'q-[hash].[ext]',
      },
    },
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
  ],
});

async function outputJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}
