import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2020',
      outDir: '../../lib',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'] as const,
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      minify: false,
      rollupOptions: {
        external: [
          'zod',
          '@qwik-city-sw-register',
          '@qwik-city-plan',
          '@builder.io/qwik/preloader',
        ],
      },
    },
    plugins: [qwikVite()],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
  };
});
