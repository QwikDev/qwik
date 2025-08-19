import { qwikVite } from '@builder.io/qwik/optimizer';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      outDir: 'lib',
      lib: {
        entry: ['./src/index.ts'],
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: [
          '@builder.io/qwik',
          '@builder.io/qwik-city',
          '@builder.io/qwik/build',
          '@auth/core',
        ],
      },
    },
    plugins: [qwikVite()],
  };
}) as any;
