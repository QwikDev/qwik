import { build, type BuildOptions, type Plugin } from 'esbuild';
import { join } from 'node:path';
import { type BuildConfig, getBanner, importPath, nodeTarget, target } from './util';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { readPackageJson } from './package-json';

/**
 * Builds @builder.io/server
 *
 * This is submodule for helping to generate server-side rendered pages, along with providing
 * utilities for prerendering and unit testing.
 */
export async function submoduleServer(config: BuildConfig) {
  const submodule = 'server';

  const qwikDomPlugin = await bundleQwikDom(config);
  const qwikDomVersion = await getQwikDomVersion(config);

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    entryNames: 'server',
    outdir: config.distQwikPkgDir,
    sourcemap: config.dev,
    bundle: true,
    platform: 'node',
    target,
    external: [
      /* no Node.js built-in externals allowed! */ '@builder.io/qwik-dom',
      '@builder.io/qwik/build',
      '@builder.io/qwik/preloader',
      '@qwik-client-manifest',
    ],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@builder.io/qwik/server', config.distVersion) },
    outExtension: { '.js': '.mjs' },
    plugins: [importPath(/^@builder\.io\/qwik$/, '@builder.io/qwik'), qwikDomPlugin],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'false',
      'globalThis.IS_ESM': 'true',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
    },
  });

  const cjsBanner = [
    getBanner('@builder.io/qwik/server', config.distVersion),
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
    plugins: [importPath(/^@builder\.io\/qwik$/, '@builder.io/qwik'), qwikDomPlugin],
    target: nodeTarget,
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'true',
      'globalThis.IS_ESM': 'false',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
      // We need to get rid of the import.meta.env values
      // Vite's base url
      'import.meta.env.BASE_URL': '"globalThis.BASE_URL||\'/\'"',
      // Vite's devserver mode
      'import.meta.env.DEV': 'false',
    },
  });

  await Promise.all([esm, cjs]);

  console.log('🐰', submodule);
}

async function bundleQwikDom(config: BuildConfig) {
  const input = join(config.packagesDir, 'qwik-dom', 'lib', 'index.js');
  const outfile = join(config.tmpDir, 'qwikdom.mjs');

  const opts: BuildOptions = {
    entryPoints: [input],
    sourcemap: false,
    minify: !config.dev,
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

async function getQwikDomVersion(config: BuildConfig) {
  const pkgJsonPath = join(config.packagesDir, 'qwik-dom');
  const pkgJson = await readPackageJson(pkgJsonPath);
  return pkgJson.version;
}

const browserCjsRequireShim = `
if (typeof require !== 'function' && typeof location !== 'undefined' && typeof navigator !== 'undefined') {
  // shim cjs require() for core.cjs within a browser
  globalThis.require = function(path) {
    if (path === './core.cjs' || path === '@builder.io/qwik') {
      if (!self.qwikCore) {
        throw new Error('Qwik Core global, "globalThis.qwikCore", must already be loaded for the Qwik Server to be used within a browser.');
      }
      return self.qwikCore;
    }
    if (path === '@builder.io/qwik/build') {
      if (!self.qwikBuild) {
        throw new Error('Qwik Build global, "globalThis.qwikBuild", must already be loaded for the Qwik Server to be used within a browser.');
      }
      return self.qwikBuild;
    }
    if (path === '@qwik-client-manifest') {
      return {};
    }
    throw new Error('Unable to require() path "' + path + '" from a browser environment.');
  };
}`;
