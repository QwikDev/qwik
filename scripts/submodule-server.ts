import { build, type BuildOptions, type Plugin } from 'esbuild';
import { join } from 'node:path';
import { readPackageJson } from './package-json.ts';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader.ts';
import { inlineBackpatchScriptsEsBuild } from './submodule-backpatch.ts';
import { type BuildConfig, getBanner, importPath, target } from './util.ts';

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
              args.path.includes('ssr') ||
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
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
    },
  });

  await Promise.all([esm]);

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
