import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      lib: {
        entry: ['./src/index.qwik.ts'],
        formats: ['es'] as const,
        fileName: (format: string, entryName: string) => `${entryName}.mjs`,
      },
    },
    plugins: [qwikVite()],
  };
});
