import { defineConfig, type UserConfigExport } from 'vite';
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
      rollupOptions: {
        external: ['zod', '@qwik-city-sw-register', '@qwik-city-plan'],
      },
    },
    plugins: [qwikVite()],
    clearScreen: false,
    optimizeDeps: {
      force: true,
    },
  };
}) as UserConfigExport;
