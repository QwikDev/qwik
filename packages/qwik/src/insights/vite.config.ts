import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2020',
      outDir: '../../dist/insights',
      lib: {
        entry: './index.ts',
        formats: ['es', 'cjs'] as const,
        fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      minify: false,

      rollupOptions: {
        external: ['@qwik.dev/core'],
      },
    },
    plugins: [dts({ outDir: '../../dist/insights', entryRoot: './', exclude: ['vite.config.ts'] })],
    clearScreen: false,
  };
});
