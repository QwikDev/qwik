import { build } from 'esbuild';
import { join } from 'node:path';
import { copyStartersDir } from './create-qwik-cli';
import { type BuildConfig, copyFile, getBanner, nodeTarget } from './util';

/**
 * Builds @builder.io/qwik/cli
 */
export async function submoduleCli(config: BuildConfig) {
  const submodule = 'cli';

  await build({
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    outfile: join(config.distQwikPkgDir, 'cli.cjs'),
    format: 'cjs',
    platform: 'node',
    target: nodeTarget,
    sourcemap: false,
    bundle: true,
    banner: { js: getBanner('@builder.io/qwik/cli', config.distVersion) },
    outExtension: { '.js': '.cjs' },
    plugins: [
      {
        name: 'colorAlias',
        setup(build) {
          build.onResolve({ filter: /^picocolors$/ }, async (args) => {
            // for some reason esbuild resolves the browser build
            // which doesn't work in node
            return { path: join(config.rootDir, 'node_modules', 'picocolors', 'picocolors.js') };
          });
        },
      },
    ],
    external: ['prettier', 'typescript'],
    define: {
      'globalThis.CODE_MOD': 'true',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  });

  await copyFile(
    join(config.srcQwikDir, submodule, 'qwik.cjs'),
    join(config.distQwikPkgDir, 'qwik.cjs')
  );

  await copyStartersDir(config, config.distQwikPkgDir, ['features', 'adapters']);

  console.log('📠', submodule);
}
