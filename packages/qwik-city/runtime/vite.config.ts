import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
    },
    resolve: {
      alias: {
        '~qwik-city-runtime': '/src/index.ts',
        '~qwik-city-runtime-service-worker': '/src/library/service-worker/index.ts',
      },
    },
    plugins: [
      qwikCity({
        routesDir: './src/app/routes',
      }),
      qwikVite(),
    ],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
    server: {
      port: 3000,
    },
  };
});
