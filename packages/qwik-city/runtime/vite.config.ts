import { defineConfig, type UserConfigExport } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2020',
      outDir: '../lib',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      minify: false,
      rollupOptions: {
        external: ['zod', '@qwik-city-sw-register', '@qwik-city-plan'],
      },
    },
    plugins: [
      qwikVite(),
      viteStaticCopy({
        targets: [
          {
            src: 'src/worker.js',
            dest: '.',
          },
        ],
      }),
    ],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
  };
}) as UserConfigExport;
