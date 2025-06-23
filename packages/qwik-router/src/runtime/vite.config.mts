import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';

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
          '@qwik-router-sw-register',
          '@qwik-router-config',
          '@qwik.dev/core/preloader',
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
