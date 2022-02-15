import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve, join } from 'path';
import { qwest } from './qwest/plugin';

export default defineConfig(async () => {
  const { default: mdx } = await import('@mdx-js/rollup');
  const { default: remarkFrontmatter } = await import('remark-frontmatter');
  const { default: remarkGfm } = await import('remark-gfm');
  const { remarkMdxFrontmatter } = await import('remark-mdx-frontmatter');

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
        remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
      }),
      qwest({
        pagesDir: resolve('../'),
        layouts: {
          tutorial: resolve('./src/layouts/tutorial/tutorial.tsx'),
          default: resolve('./src/layouts/docs/docs.tsx'),
        },
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
