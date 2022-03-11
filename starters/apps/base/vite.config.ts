import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { dirname, resolve } from 'path';
import { writeFile, mkdir } from 'fs/promises';

export default defineConfig(({ mode }) => {
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
    ],
  };
});

async function outputJSON(path: string, data: any) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}
