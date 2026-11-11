/**
 * This is the base config for vite. When building, the adapter config is used which loads this file
 * and extends it.
 */
import { defineConfig, type UserConfig } from 'vite';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import basicSsl from '@vitejs/plugin-basic-ssl';
/**
 * Note that Vite normally starts from `index.html` but the qwikRouter plugin makes start at
 * `src/entry.ssr.tsx` instead.
 */
export default defineConfig((): UserConfig => {
  return {
    plugins: [
      qwikRouter(),
      qwikVite({ debug: true, tsOptimizer: true }),
      tsconfigPaths({ root: '.' }),
      basicSsl(),
    ],
    build: {
      minify: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: (id) => {
                  if (id.includes('vendor-lib')) {
                    return 'vendor';
                  }
                },
              },
            ],
          },
          comments: true,
        },
        experimental: {
          attachDebugInfo: 'full',
        },
      },
    },
  };
});
