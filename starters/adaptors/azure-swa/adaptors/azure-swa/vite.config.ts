import { azureSwaAdaptor } from '@builder.io/qwik-city/adaptors/azure-swa/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      outDir: 'server',
      rollupOptions: {
        input: ['src/entry.azure-swa.tsx', '@qwik-city-plan'],
        output: {
          entryFileNames: `[name].[hash].mjs`,
          chunkFileNames: `[name].[hash].mjs`,
        },
      },
    },
    ssr: {
      target: 'webworker',
      noExternal: true,
      outDir: 'dist/server',
    },
    plugins: [
      azureSwaAdaptor({
        staticGenerate: true,
      }),
    ],
  };
});
