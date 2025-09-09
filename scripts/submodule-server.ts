import { build, type BuildOptions, type Plugin } from 'esbuild';
import { join } from 'node:path';
import { readPackageJson } from './package-json';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { inlineBackpatchScriptsEsBuild } from './submodule-backpatch';
import { type BuildConfig, getBanner, importPath, nodeTarget, target } from './util';

/**
 * Builds @qwik.dev/core/server
 *
 * This is submodule for helping to generate server-side rendered pages, along with providing
 * utilities for prerendering and unit testing.
 */
export async function submoduleServer(config: BuildConfig) {
  const submodule = 'server';
  console.log('🐰 start', submodule);

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
      '@qwik.dev/dom',
      '@qwik.dev/core',
      '@qwik.dev/core/build',
      '@qwik.dev/core/preloader',
      '@qwik-client-manifest',
    ],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@qwik.dev/core/server', config.distVersion) },
    outExtension: { '.js': '.mjs' },
    plugins: [
      // uncomment this if you want to find what imports what
      // so you can make sure client isn't being imported
      // {
      //   name: 'spy-resolve',
      //   setup(build) {
      //     build.onResolve({ filter: /./ }, (args) => {
      //       console.log('spy-resolve', args);
      //       return undefined;
      //     });
      //   },
      // },
      {
        // throws an error if files from src/core are loaded, except for some allowed imports
        name: 'forbid-core',
        setup(build) {
          build.onLoad({ filter: /src[\\/]core[\\/]/ }, (args) => {
            if (
              args.path.includes('util') ||
              args.path.includes('shared') ||
              // we allow building preloader into server builds
              args.path.includes('preloader')
            ) {
              return null;
            }
            console.error('forbid-core', args);
            throw new Error('Import of core files is not allowed in server builds.');
          });
        },
      },
      importPath(/^@qwik\.dev\/core$/, '@qwik.dev/core'),
      qwikDomPlugin,
    ],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      ...(await inlineBackpatchScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'false',
      'globalThis.IS_ESM': 'true',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
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
    plugins: [importPath(/^@qwik\.dev\/core$/, '@qwik.dev/core'), qwikDomPlugin],
    target: nodeTarget,
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      ...(await inlineBackpatchScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'true',
      'globalThis.IS_ESM': 'false',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
      // We need to get rid of the import.meta.env values
      // Vite's base url
      'import.meta.env.BASE_URL': 'globalThis.BASE_URL',
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
      build.onResolve({ filter: /@qwik.dev\/dom/ }, () => {
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
    if (path === '@qwik-client-manifest') {
      return {};
    }
    throw new Error('Unable to require() path "' + path + '" from a browser environment.');
  };
}`;
