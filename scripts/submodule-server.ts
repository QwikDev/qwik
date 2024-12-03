import { build, type BuildOptions } from 'esbuild';
import { join } from 'node:path';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { type BuildConfig, getBanner, importPath, nodeTarget, target } from './util';

/**
 * Builds @qwik.dev/core/server
 *
 * This is submodule for helping to generate server-side rendered pages, along with providing
 * utilities for prerendering and unit testing.
 */
export async function submoduleServer(config: BuildConfig) {
  const submodule = 'server';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    entryNames: 'server',
    outdir: config.distQwikPkgDir,
    sourcemap: config.dev,
    bundle: true,
    platform: 'node',
    target,
    external: ['@qwik.dev/core', '@qwik.dev/core/build', 'jsdom'],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@qwik.dev/core/server', config.distVersion) },
    outExtension: { '.js': '.mjs' },
    plugins: [
      // uncomment this if you want to find what imports qwik-external
      // {
      //   name: 'spy-resolve',
      //   setup(build) {
      //     build.onResolve({ filter: /./ }, (args) => {
      //       console.log('spy-resolve', args);
      //       return undefined;
      //     });
      //   },
      // },
      importPath(/^@qwik\.dev\/core$/, '@qwik.dev/core'),
    ],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'false',
      'globalThis.IS_ESM': 'true',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  });

  const cjsBanner = [
    getBanner('@qwik.dev/core/server', config.distVersion),
    `globalThis.qwikServer = (function (module) {`,
    browserCjsRequireShim,
  ].join('\n');

  const cjs = build({
    ...opts,
    format: 'cjs',
    banner: {
      js: cjsBanner,
    },
    footer: {
      js: `return module.exports; })(typeof module === 'object' && module.exports ? module : { exports: {} });`,
    },
    outExtension: { '.js': '.cjs' },
    plugins: [importPath(/^@qwik\.dev\/core$/, '@qwik.dev/core')],
    target: nodeTarget,
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'true',
      'globalThis.IS_ESM': 'false',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  });

  await Promise.all([esm, cjs]);

  console.log('🐰', submodule);
}

const browserCjsRequireShim = `
if (typeof require !== 'function' && typeof location !== 'undefined' && typeof navigator !== 'undefined') {
  // shim cjs require() for core.cjs within a browser
  globalThis.require = function(path) {
    if (path === './core.cjs' || path === '@qwik.dev/core') {
      if (!self.qwikCore) {
        throw new Error('Qwik Core global, "globalThis.qwikCore", must already be loaded for the Qwik Server to be used within a browser.');
      }
      return self.qwikCore;
    }
    if (path === '@qwik.dev/core/build') {
      if (!self.qwikBuild) {
        throw new Error('Qwik Build global, "globalThis.qwikBuild", must already be loaded for the Qwik Server to be used within a browser.');
      }
      return self.qwikBuild;
    }
    throw new Error('Unable to require() path "' + path + '" from a browser environment.');
  };
}`;
