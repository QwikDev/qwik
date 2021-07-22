import { build, BuildOptions, Plugin } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  importPath,
  nodeBuiltIns,
  nodeTarget,
  target,
  watcher,
  injectGlobalThisPoly,
} from './util';

/**
 * Builds @builder.io/server
 *
 * This is submodule for helping to generate server-side rendered pages,
 * along with providing utilities for prerendering and unit testing.
 */
export async function submoduleServer(config: BuildConfig) {
  const submodule = 'server';

  const dominoPlugin = await bundleDomino(config);

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    outdir: join(config.pkgDir, submodule),
    sourcemap: true,
    bundle: true,
    target,
    banner,
    external: [...nodeBuiltIns, 'domino'],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.mjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.mjs'),
      dominoPlugin,
    ],
    watch: watcher(config, submodule),
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.cjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.cjs'),
      dominoPlugin,
    ],
    watch: watcher(config),
    platform: 'node',
    target: nodeTarget,
    inject: [injectGlobalThisPoly(config)],
  });

  await Promise.all([esm, cjs]);

  console.log('🐠', submodule);
}

async function bundleDomino(config: BuildConfig) {
  const outfile = join(config.distDir, 'domino.mjs');

  const opts: BuildOptions = {
    entryPoints: [join(config.rootDir, 'node_modules', 'domino', 'lib', 'index.js')],
    sourcemap: false,
    minify: true,
    bundle: true,
    target,
    outfile,
    format: 'esm',
    plugins: [
      {
        name: 'sloppyDomino',
        setup(build) {
          build.onLoad({ filter: /.*sloppy\.js/ }, (args) => {
            return {
              // esm modules cannot use `with` statement
              // and questionable if this feature is needed for ssr
              contents: `
              module.exports={
                Window_run:function _run(){},
                EventHandlerBuilder_build:function build(){}
              };`,
            };
          });
        },
      },
    ],
  };

  await build(opts);

  const dominoPlugin: Plugin = {
    name: 'dominoPlugin',
    setup(build) {
      build.onResolve({ filter: /domino/ }, () => {
        return {
          path: outfile,
        };
      });
    },
  };

  return dominoPlugin;
}
