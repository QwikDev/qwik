import { defineConfig } from 'vite';
import netlifyEdge from '@netlify/vite-plugin-netlify-edge';
import { qwikVite } from '@builder.io/qwik/optimizer';
import manifest from './dist/q-manifest.json';

export default defineConfig(() => {
  return {
    plugins: [
      qwikVite({
        ssr: { outDir: '.netlify/edge-functions/handler', manifestInput: manifest },
      }),
      netlifyEdge({
        functionName: 'entry.netlify',
      }),
    ],
  };
});
