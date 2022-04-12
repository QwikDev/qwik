import { build, BuildOptions, Plugin } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  injectGlobalThisPoly,
  nodeTarget,
  PackageJSON,
  target,
  watcher,
  injectGlobalPoly,
} from './util';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { readPackageJson, writePackageJson } from './package-json';

/**
 * Builds @builder.io/server
 *
 * This is submodule for helping to generate server-side rendered pages,
 * along with providing utilities for prerendering and unit testing.
 */
export async function submoduleServer(config: BuildConfig) {
  const submodule = 'server';

  const qwikDomPlugin = await bundleQwikDom(config);
  const qwikDomVersion = await getQwikDomVersion();

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    entryNames: 'server',
    outdir: config.distPkgDir,
    sourcemap: config.dev,
    bundle: true,
    target,
    banner,
    external: [/* no nodejs built-in externals allowed! */ '@builder.io/qwik-dom'],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [qwikDomPlugin],
    watch: watcher(config, submodule),
    inject: [injectGlobalPoly(config)],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'false',
      'globalThis.IS_ESM': 'true',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
    },
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    banner: {
      js: `globalThis.qwikServer = (function (module) {`,
    },
    footer: {
      js: `return module.exports; })(typeof module === 'object' && module.exports ? module : { exports: {} });`,
    },
    outExtension: { '.js': '.cjs' },
    plugins: [qwikDomPlugin],
    watch: watcher(config),
    platform: 'node',
    target: nodeTarget,
    inject: [injectGlobalThisPoly(config), injectGlobalPoly(config)],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'true',
      'globalThis.IS_ESM': 'false',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
    },
  });

  await Promise.all([esm, cjs]);

  console.log('🐰', submodule);
}

async function bundleQwikDom(config: BuildConfig) {
  const outfile = join(config.distDir, 'qwikdom.mjs');

  const opts: BuildOptions = {
    entryPoints: [require.resolve('@builder.io/qwik-dom')],
    sourcemap: false,
    minify: true,
    bundle: true,
    target,
    outfile,
    format: 'esm',
  };

  await build(opts);

  const qwikDomPlugin: Plugin = {
    name: 'qwikDomPlugin',
    setup(build) {
      build.onResolve({ filter: /@builder.io\/qwik-dom/ }, () => {
        return {
          path: outfile,
        };
      });
    },
  };

  return qwikDomPlugin;
}

async function getQwikDomVersion() {
  const indexPath = require.resolve('@builder.io/qwik-dom');
  const pkgJsonPath = join(indexPath, '..', '..');
  const pkgJson = await readPackageJson(pkgJsonPath);
  return pkgJson.version;
}
