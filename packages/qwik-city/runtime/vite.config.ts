import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';

export default defineConfig(() => {
  return {
    ssr: {
      target: 'webworker',
    },
    build: {
      outDir: '../lib',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => {
          return format === 'es' ? `index.qwik.js` : `index.qwik.cjs`;
        },
      },
    },
    plugins: [
      qwikCity({
        routesDir: './src/app/routes',
      }),
      qwikVite(),
    ],
    optimizeDeps: {
      exclude: [
        '@builder.io/qwik',
        '@builder.io/qwik/optimizer',
        '@builder.io/qwik/server',
        '@builder.io/qwik-city',
        '@builder.io/qwik-city/adaptors/cloudflare-pages',
        '@builder.io/qwik-city/adaptors/express',
        '@builder.io/qwik-city/vite',
      ],
    },
    clearScreen: false,
  };
});
