import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2020',
      outDir: '../lib',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.${format}.qwik.js`,
      },
      rollupOptions: {
        external: ['@qwik-city-plan'],
      },
    },
    resolve: {
      alias: {
        '~qwik-city-runtime': '/src/index.ts',
      },
    },
    plugins: [
      qwikCity({
        routesDir: './src/app/routes',
      }),
      qwikVite(),
    ],
    clearScreen: false,
    server: {
      force: true,
    },
  };
});
