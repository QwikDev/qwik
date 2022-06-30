import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
/* VITE_IMPORTS */

export default defineConfig(() => {
  return {
    /* VITE_CONFIG */
    plugins: [
      qwikCity(),
      qwikVite(/* VITE_QWIK */),
      tsconfigPaths(),
      /* VITE_PLUGINS */
    ],
  };
});
