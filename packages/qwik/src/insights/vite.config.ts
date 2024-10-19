import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => {
  return {
    build: {
      target: 'es2020',
      outDir: '../../dist/insights',
      lib: {
        entry: './src/components/insights.ts',
        formats: ['es'] as const,
        fileName: (format) => `insights.${format === 'es' ? 'js' : 'cjs'}`,
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
