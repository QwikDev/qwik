import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { qwikTypes } from '@builder.io/qwik-labs/vite';

export default defineConfig(() => {
  return {
    plugins: [qwikCity(), qwikTypes(), qwikVite(), tsconfigPaths({ projects: ['.'] })],
    preview: {
      headers: {
        'Cache-Control': 'public, max-age=600',
      },
    },
  };
});
