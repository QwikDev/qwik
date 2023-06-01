import { expressAdaptor } from '@builder.io/qwik-city/adaptors/express/vite';
import { extendConfig } from '@builder.io/qwik-city/vite';
import baseConfig from '../../vite.config';

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ['src/entry.aws-lambda.tsx', 'src/entry.ssr.tsx', '@qwik-city-plan'],
      },
    },
    ssr: {
      target: 'webworker',
      noExternal: true,
    },
    plugins: [
      expressAdaptor({
        staticGenerate: true,
      }),
    ],
  };
});
