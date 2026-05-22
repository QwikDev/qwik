import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => ({
  root: __dirname,
  plugins: [
    qwikRouter(),
    qwikVite({ experimental: ['suspense'] }),
    tsconfigPaths({ root: __dirname }),
  ],
  server: {
    headers: {
      'Cache-Control': 'public, max-age=0',
    },
  },
}));
