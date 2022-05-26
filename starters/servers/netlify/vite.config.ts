import { defineConfig } from 'vite';
import netlifyEdge from '@netlify/vite-plugin-netlify-edge';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig(() => {
  return {
    plugins: [
      qwikVite({
        ssr: { outDir: '.netlify/edge-functions/entry.netlify' },
      }),
      netlifyEdge({
        functionName: 'entry.netlify',
      }),
    ],
  };
});
