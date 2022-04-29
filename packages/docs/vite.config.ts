import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { resolve } from 'path';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { partytownVite } from '@builder.io/partytown/utils';

export default defineConfig(() => {
  return {
    clearScreen: false,
    plugins: [
      qwikCity({
        pagesDir: resolve('pages'),
        layouts: {
          tutorial: resolve('src', 'layouts', 'tutorial', 'tutorial.tsx'),
          default: resolve('src', 'layouts', 'docs', 'docs.tsx'),
        },
      }),
      qwikVite(),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
    ],
  };
});
