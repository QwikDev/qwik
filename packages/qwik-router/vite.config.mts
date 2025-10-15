import { defineConfig } from 'vite';
import { compiledStringPlugin } from '../../scripts/compiled-string-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(() => {
  return {
    build: {
      emptyOutDir: false,
      ssr: true,
      modulePreload: false,
      target: 'es2020',
      outDir: 'lib',
      minify: false,
      rollupOptions: {
        input: {
          index: './src/runtime/src/',
          'adapters/azure-swa/vite': './src/adapters/azure-swa/vite',
          'adapters/cloudflare-pages/vite': './src/adapters/cloudflare-pages/vite',
          'adapters/cloud-run/vite': './src/adapters/cloud-run/vite',
          'adapters/bun-server/vite': './src/adapters/bun-server/vite',
          'adapters/deno-server/vite': './src/adapters/deno-server/vite',
          'adapters/node-server/vite': './src/adapters/node-server/vite',
          'adapters/netlify-edge/vite': './src/adapters/netlify-edge/vite',
          'adapters/shared/vite': './src/adapters/shared/vite',
          'adapters/ssg/vite': './src/adapters/ssg/vite',
          'adapters/vercel-edge/vite': './src/adapters/vercel-edge/vite',
          'middleware/azure-swa': './src/middleware/azure-swa',
          'middleware/aws-lambda': './src/middleware/aws-lambda',
          'middleware/cloudflare-pages': './src/middleware/cloudflare-pages',
          'middleware/firebase': './src/middleware/firebase',
          'middleware/deno': './src/middleware/deno',
          'middleware/bun': './src/middleware/bun',
          'middleware/netlify-edge': './src/middleware/netlify-edge',
          'middleware/node': './src/middleware/node',
          'middleware/request-handler': './src/middleware/request-handler',
          'middleware/vercel-edge': './src/middleware/vercel-edge',
          ssg: './src/ssg',
          vite: './src/buildtime/vite',
          'service-worker': './src/runtime/src/service-worker',
        },
        output: [
          {
            format: 'es',
            chunkFileNames: (chunkInfo) =>
              chunkInfo.moduleIds.some((id) => id.includes('runtime'))
                ? 'chunks/[name].qwik.mjs'
                : 'chunks/[name].mjs',
            entryFileNames: (chunkInfo) =>
              chunkInfo.name === 'index' ? '[name].qwik.mjs' : '[name]/index.mjs',
          },
        ],
        external: [
          /node:.*/,
          'fsevents',
          'zod',
          '@qwik-router-sw-register',
          '@qwik-router-config',
          /@qwik\.dev\/core/,
          /@qwik\.dev\/router\//,
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.peerDependencies || {}),
        ],
      },
    },
    plugins: [compiledStringPlugin()],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
  };
});
