import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';

export default defineConfig(() => {
  return {
    ssr: {
      noExternal: false,
    },
    build: {
      outDir: '../lib',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => {
          return format === 'es' ? `index.qwik.mjs` : `index.qwik.cjs`;
        },
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
    optimizeDeps: {
      exclude: [
        '@builder.io/qwik',
        '@builder.io/qwik/jsx-runtime',
        '@builder.io/qwik/jsx-dev-runtime',
        '@builder.io/qwik/optimizer',
        '@builder.io/qwik/server',
        '@builder.io/qwik-city',
        '@builder.io/qwik-city/middleware/cloudflare-pages',
        '@builder.io/qwik-city/middleware/express',
        '@builder.io/qwik-city/vite',
      ],
    },
    clearScreen: false,
    server: {
      force: true,
    },
  };
});
