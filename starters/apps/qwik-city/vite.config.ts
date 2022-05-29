import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import { resolve } from 'path';
/* VITE_IMPORTS */

export default defineConfig(() => {
  const pagesDir = resolve('pages');

  return {
    /* VITE_CONFIG */
    plugins: [
      qwikCity({
        pagesDir,
        layouts: {
          default: resolve('src', 'layouts', 'default', 'default.tsx'),
        },
      }),
      qwikVite(/* VITE_QWIK */),
      /* VITE_PLUGINS */
    ],
  };
});
