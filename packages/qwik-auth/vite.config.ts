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
  };
});
