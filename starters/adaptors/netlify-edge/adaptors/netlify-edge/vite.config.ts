import netlifyEdge from '@netlify/vite-plugin-netlify-edge';
import { netifyEdgeAdaptor } from '@builder.io/qwik-city/adaptors/netlify-edge/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.netlify-edge.tsx', '@qwik-city-plan'],
      },
      outDir: 'netlify/edge-functions/entry.netlify-edge',
    },
    ssr: {
      target: 'webworker',
      noExternal: true,
    },
    plugins: [
      netifyEdgeAdaptor({
        staticGenerate: true,
      }),
      netlifyEdge({ functionName: 'entry.netlify-edge' }),
    ],
  };
});
