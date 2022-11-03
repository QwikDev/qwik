import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';

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
      emptyOutDir: false,
      rollupOptions: {
        external: ['@qwik-city-sw-register', '@qwik-city-plan'],
      },
    },
    resolve: {
      alias: {
        '~qwik-city-runtime': '/src/index.ts',
        '~qwik-city-runtime-service-worker': '/src/library/service-worker/index.ts',
      },
    },
    plugins: [qwikVite()],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
  };
});
