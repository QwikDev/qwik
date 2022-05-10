import { defineConfig } from 'vite';
import netlifyEdge from '@netlify/vite-plugin-netlify-edge';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig(() => {
  return {
    plugins: [
      qwikVite({
        outServerDir: '.netlify/edge-functions/handler',
        srcEntryServerInput: 'handler.ts',
      }),
      netlifyEdge(),
    ],
  };
});
