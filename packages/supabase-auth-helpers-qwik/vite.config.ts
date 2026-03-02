import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig((config) => {
  return {
    build: {
      minify: false,
      target: 'es2020',
      outDir: 'lib',
      lib: {
        entry: ['./src/index.ts'],
        formats: ['es'],
        fileName: () => `index.qwik.mjs`,
      },
      rollupOptions: {
        external: [
          '@qwik.dev/core',
          '@qwik.dev/router',
          '@qwik.dev/core/build',
          '@supabase/supabase-js',
          '@supabase/auth-helpers-shared',
        ],
      },
    },
    define: {
      PACKAGE_NAME: JSON.stringify(pkg.name),
      PACKAGE_VERSION: JSON.stringify(pkg.version),
    },
    plugins: [qwikVite()],
  };
}) as any;
