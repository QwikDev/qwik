import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';
import { qwest } from './qwest/dist/vite/index.mjs';
import { partytownVite } from '@builder.io/partytown/utils';

export default defineConfig(() => {
  return {
    clearScreen: false,
    plugins: [
      qwikVite(),
      qwest({
        pagesDir: resolve('pages'),
        layouts: {
          tutorial: resolve('src', 'layouts', 'tutorial', 'tutorial.tsx'),
          default: resolve('src', 'layouts', 'docs', 'docs.tsx'),
        },
      }),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
    ],
  };
});
