import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      lib: {
        entry: ['./src/index.qwik.ts', './src/vite.ts'],
        formats: ['es', 'cjs'],
        fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: [
          'react',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          'react-dom',
          'react-dom/client',
          'react-dom/server',
        ],
      },
    },
    plugins: [qwikVite()],
  };
});
