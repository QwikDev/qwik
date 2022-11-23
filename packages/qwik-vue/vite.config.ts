import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';
import { qwikVue } from './src/vite';

export default defineConfig(() => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      lib: {
        entry: './src/index.ts',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.qwik.${format === 'es' ? 'mjs' : 'cjs'}`,
      },
      rollupOptions: {
        external: ['vue'],
      },
    },
    plugins: [
      qwikVite(),
      vue(),
      qwikVue({
        appEntrypoint: '/src/setup.ts',
      }),
      tsconfigPaths(),
    ],
  };
});
