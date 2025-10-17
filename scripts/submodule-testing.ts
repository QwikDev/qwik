import { join } from 'node:path';
import { build } from 'vite';
import { compiledStringPlugin } from './compiled-string-plugin';
import { writePackageJson } from './package-json';
import { getBanner, nodeTarget, type BuildConfig, type PackageJSON } from './util';

/** Builds @qwik.dev/core/testing */
export async function submoduleTesting(config: BuildConfig) {
  const submodule = 'testing';

  await build({
    clearScreen: false,
    build: {
      emptyOutDir: false,
      lib: {
        entry: join(config.srcQwikDir, submodule, 'index.ts'),
        formats: ['es'],
        fileName: '[name].mjs',
      },
      outDir: join(config.distQwikPkgDir, submodule),
      sourcemap: true,
      target: 'es2020',
      rollupOptions: {
        external: [
          /node:/,
          'esbuild',
          'prettier',
          'vitest',
          /@qwik.dev\/core/,
          '@qwik-client-manifest',
        ],
        output: {
          banner: getBanner('@qwik.dev/core/testing', config.distVersion),
        },
      },
    },
    plugins: [compiledStringPlugin()],
    environments: {
      ssr: {
        build: {
          target: nodeTarget,
        },
      },
    },
    define: {
      'globalThis.MODULE_EXT': `"mjs"`,
      'globalThis.RUNNER': `false`,
    },
  });

  await generateTestingPackageJson(config);

  console.log('🦁', submodule);
}

async function generateTestingPackageJson(config: BuildConfig) {
  const pkg: PackageJSON = {
    name: '@qwik.dev/core/testing',
    version: config.distVersion,
    main: 'index.mjs',
    types: 'index.d.ts',
    private: true,
    type: 'module',
    sideEffects: true,
  };
  const testingDistDir = join(config.distQwikPkgDir, 'testing');
  await writePackageJson(testingDistDir, pkg);
}
