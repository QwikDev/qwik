import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import pkg from './package.json';
import { qwikDevtools } from '@devtools/plugin';
import { createRequire } from 'module';
import tailwindcss from '@tailwindcss/vite';
const { dependencies = {}, peerDependencies = {} } = pkg as any;
const makeRegex = (dep: string) => new RegExp(`^${dep}(/.*)?$`);
const excludeAll = (obj: Record<string, unknown>) =>
  Object.keys(obj).map(makeRegex);
const require = createRequire(import.meta.url);
const isBuild = process.argv.includes('lib');

export default defineConfig(() => {
  return {
    resolve: {
      alias: isBuild
        ? undefined
        : {
            '@devtools/ui': require.resolve('.'),
            '@qwik.dev/devtools/ui': require.resolve('.'),
          },
    },
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
        external: [
          'stream',
          'util',
          '@qwik.dev/core',
          '@qwik.dev/router',
          /^node:.*/,
          ...excludeAll(peerDependencies),
          ...excludeAll(dependencies),
        ],
      },
    },
    plugins: [qwikVite(), tsconfigPaths(), qwikDevtools(), tailwindcss()],
  };
});
