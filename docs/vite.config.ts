import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { qwest } from './qwest/dist/vite/index.mjs';
import { partytownVite } from '@builder.io/partytown/utils';

export default defineConfig(async ({ mode }) => {
  return {
    build: {
      rollupOptions: {
        input: ['src/main.tsx', 'index.html'],
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
        // On `clientonly` mode, lets disable SSR in development, so app is fully client bootstrapped
        ssr: mode === 'clientonly' ? false : undefined,
        srcDir: resolve('./src'),
        entryStrategy: {
          type: 'single',
        },
        symbolsOutput: (data) => {
          outputJSON('./server/q-symbols.json', data);
        },
      }),
      qwest({
        pagesDir: resolve('./pages'),
        layouts: {
          tutorial: resolve('./src/layouts/tutorial/tutorial.tsx'),
          default: resolve('./src/layouts/docs/docs.tsx'),
        },
      }),
      partytownVite({
        dest: join(__dirname, 'dist', '~partytown'),
      }),
    ],
  };
});

async function outputJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}
