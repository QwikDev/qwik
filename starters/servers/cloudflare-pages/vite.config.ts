import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { join } from 'path';

export default defineConfig(() => {
  return {
    ssr: {
      // SSR builds for the edge should use the "webworker" target
      target: 'webworker',

      // No external imports in ssr module, instead bundle into one file
      noExternal: true,
    },
    plugins: [
      qwikVite({
        ssr: {
          outFile: join(__dirname, 'functions', '[[path.js]]'),
        },
      }),
    ],
  };
});
