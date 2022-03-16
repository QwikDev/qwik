import { build, BuildOptions, Plugin } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  importPath,
  injectGlobalThisPoly,
  nodeBuiltIns,
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

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    outdir: join(config.distPkgDir, submodule),
    sourcemap: config.dev,
    bundle: true,
    target,
    banner,
    external: [...nodeBuiltIns, '@builder.io/qwik-dom'],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.DOMINO_VERSION': JSON.stringify(await getDominoVersion()),
    },
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.mjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.mjs'),
      qwikDomPlugin,
    ],
    watch: watcher(config, submodule),
    inject: [injectGlobalPoly(config)],
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.cjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.cjs'),
      qwikDomPlugin,
    ],
    watch: watcher(config),
    platform: 'node',
    target: nodeTarget,
    inject: [injectGlobalThisPoly(config), injectGlobalPoly(config)],
  });

  await Promise.all([esm, cjs]);
  await generateServerPackageJson(config);

  console.log('🐰', submodule);
}

async function generateServerPackageJson(config: BuildConfig) {
  const pkg: PackageJSON = {
    name: '@builder.io/qwik/server',
    version: config.distVersion,
    main: 'index.cjs',
    module: 'index.mjs',
    types: 'index.d.ts',
    private: true,
  };
  const serverDistDir = join(config.distPkgDir, 'server');
  await writePackageJson(serverDistDir, pkg);
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
    name: 'domiqwikDomPluginnoPlugin',
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

async function getDominoVersion() {
  const indexPath = require.resolve('@builder.io/qwik-dom');
  const pkgJsonPath = join(indexPath, '..', '..');
  const pkgJson = await readPackageJson(pkgJsonPath);
  return pkgJson.version;
}
