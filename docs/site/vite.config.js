import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve, join } from 'path';

export default defineConfig(async () => {
  const { default: mdx } = await import('@mdx-js/rollup');

  return {
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
      mdx({
        jsxImportSource: getQwik(),
      }),
    ],
  };
});

async function outputJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

function getQwik() {
  if (!process.env.CI) {
    return join(__dirname, '..', '..', 'dist-dev', '@builder.io-qwik');
  }
  return '@builder.io/qwik';
}
