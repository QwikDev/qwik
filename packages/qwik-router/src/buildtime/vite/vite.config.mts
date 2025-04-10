import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2020',
      outDir: '../../../lib',
      lib: {
        entry: '.',
        formats: ['es', 'cjs'] as const,
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      minify: false,
      rollupOptions: {
        external: [
          'fs',
          'path',
          'url',
          'vite',
          'source-map',
          'vfile',
          '@mdx-js/mdx',
          'node-fetch',
          'undici',
          'typescript',
          'vite-imagetools',
          'svgo',
          // We import this for 404 handling
          '@qwik.dev/router/middleware/request-handler',
        ],
      },
    },
    resolve: {
      alias: {
        '@qwik.dev/core': 'do-not-import-qwik-in-the-vite-plugin',
      },
    },
  };
});
