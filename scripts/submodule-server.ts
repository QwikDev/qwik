import { build, BuildOptions, Plugin } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  importPath,
  injectGlobalThisPoly,
  injectGlobalPoly,
  nodeTarget,
  target,
  watcher,
} from './util';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { readPackageJson } from './package-json';

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
    plugins: [importPath(/^@builder\.io\/qwik$/, './core.mjs'), qwikDomPlugin],
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
      js: `globalThis.qwikServer = (function (module) {\n${getWebWorkerCjsRequireShim()}`,
    },
    footer: {
      js: `return module.exports; })(typeof module === 'object' && module.exports ? module : { exports: {} });`,
    },
    outExtension: { '.js': '.cjs' },
    plugins: [importPath(/^@builder\.io\/qwik$/, './core.cjs'), qwikDomPlugin],
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

function getWebWorkerCjsRequireShim() {
  return `
  if (typeof require !== 'function' && typeof self !== 'undefined' && typeof location !== 'undefined' && typeof navigator !== 'undefined' && typeof XMLHttpRequest === 'function' && typeof WorkerGlobalScope === 'function' && typeof self.importScripts === 'function') {
    // shim cjs require() for core.cjs within web worker env
    // using sync xhr since service workers cannot use importScripts() and a require() cannot be async so we can't use fetch()
    self.require = function(path) {
      if (path === './core.cjs') { 
        if (!self.qwikCore) {
          const cdnUrl = 'https://cdn.jsdelivr.net/npm/@builder.io/qwik@' + versions.qwik + '/core.cjs';
          const xhr = new XMLHttpRequest();
          xhr.open('GET', cdnUrl, false);
          xhr.send();
          const mod = { exports: {} };
          const exec = new Function(mod, mod.exports, xhr.responseText);
          exec(mod, mod.exports);
          self.qwikCore = mod.exports;
        }
        return self.qwikCore;
      }
      throw new Error('Unable to require() path "' + path + '" from web worker environment.');
    };
  }
  `;
}
