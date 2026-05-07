import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';
import { qwikDevtools } from '../plugin/src/index';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const externalDependencies = [
  '@qwik.dev/core',
  '@qwik.dev/devtools/kit',
  '@qwik.dev/router',
  '@tailwindcss/postcss',
  '@tailwindcss/vite',
  'tailwindcss',
  'vite',
];
const makeRegex = (dep: string) => new RegExp(`^${dep}(/.*)?$`);

export default defineConfig(() => {
  return {
    root: __dirname,
    build: {
      target: 'es2020',
      lib: {
        entry: {
          index: './src/index.ts',
          'entry.extension': './src/entry.extension.tsx',
        },
        formats: ['es'],
        fileName: (format, entryName) => `${entryName}.qwik.mjs`,
        cssFileName: 'styles',
      },
      rollupOptions: {
        output: {
          preserveModules: true,
          preserveModulesRoot: 'src',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'styles.css';
            }
            return '[name]-[hash][extname]';
          },
        },
        // externalize deps that shouldn't be bundled into the library
        external: ['stream', 'util', /^node:.*/, ...externalDependencies.map(makeRegex)],
      },
    },
    plugins: [qwikVite(), qwikDevtools(), tailwindcss()],
  };
});
