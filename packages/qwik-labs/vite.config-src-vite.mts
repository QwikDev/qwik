import { defineConfig } from 'vite';
import dtsPlugin from 'vite-plugin-dts';

export default defineConfig(() => {
  return {
    ssr: {
      external: true,
    },
    build: {
      ssr: true,
      target: 'es2021',
      outDir: 'vite',
      lib: {
        entry: './src-vite',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
    },
    plugins: [
      dtsPlugin({
        // rollupTypes: true,
        tsconfigPath: 'tsconfig-vite.json',
        logLevel: 'info',
        outDir: 'vite',
      }),
    ],
  };
});
