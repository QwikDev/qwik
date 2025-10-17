import { join } from 'node:path';
import { build as viteBuild, type Plugin } from 'vite';
import { readPackageJson } from './package-json';
import { inlineBackpatchScriptsEsBuild } from './submodule-backpatch';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { target, type BuildConfig } from './util';

/**
 * Builds @qwik.dev/core/server
 *
 * This is submodule for helping to generate server-side rendered pages, along with providing
 * utilities for prerendering and unit testing.
 */

// Vite plugin to forbid core imports
export const forbidCorePlugin = (): Plugin => {
  return {
    name: 'forbid-core',
    enforce: 'pre',
    load: {
      order: 'pre',
      handler(id) {
        if (id.includes('src/core/')) {
          if (
            id.includes('util') ||
            id.includes('shared') ||
            // we allow building preloader into server builds
            id.includes('preloader')
          ) {
            return null;
          }
          console.error('forbid-core', id);
          throw new Error('Import of core files is not allowed in server builds.');
        }
      },
    },
  };
};

export async function submoduleServer(config: BuildConfig) {
  const submodule = 'server';
  console.log('🐰 start', submodule);

  const qwikDomPlugin = await bundleQwikDom(config);
  const qwikDomVersion = await getQwikDomVersion(config);

  await viteBuild({
    clearScreen: false,
    build: {
      emptyOutDir: false,
      lib: {
        entry: join(config.srcQwikDir, submodule, 'index.ts'),
      },
      outDir: config.distQwikPkgDir,
      sourcemap: config.dev,
      rollupOptions: {
        external: [/@qwik.dev\/core/, '@qwik.dev/dom', '@qwik-client-manifest'],
        output: [
          {
            format: 'es',
            entryFileNames: 'server.mjs',
          },
        ],
      },
      target,
    },
    plugins: [
      forbidCorePlugin(),
      // importPathPlugin(/^@qwik\.dev\/core$/, '@qwik.dev/core'),
      // TODO why do we have this while it's also external?
      qwikDomPlugin,
    ],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      ...(await inlineBackpatchScriptsEsBuild(config)),
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      'globalThis.QWIK_DOM_VERSION': JSON.stringify(qwikDomVersion),
    },
  });

  console.log('🐰', submodule);
}

async function bundleQwikDom(config: BuildConfig) {
  const input = join(config.packagesDir, 'qwik-dom', 'lib', 'index.js');
  const outfile = join(config.tmpDir, 'qwikdom.mjs');

  await viteBuild({
    clearScreen: false,
    build: {
      emptyOutDir: false,
      lib: {
        entry: input,
        name: 'qwikDom',
      },
      outDir: config.tmpDir,
      sourcemap: false,
      minify: !config.dev,
      target,
      rollupOptions: {
        external: ['@qwik.dev/core'],
        output: {
          format: 'es',
          entryFileNames: 'qwikdom.mjs',
        },
      },
    },
  });

  const qwikDomPlugin: Plugin = {
    name: 'qwikDomPlugin',
    resolveId(id) {
      if (id === '@qwik.dev/dom') {
        return outfile;
      }
    },
  };

  return qwikDomPlugin;
}

async function getQwikDomVersion(config: BuildConfig) {
  const pkgJsonPath = join(config.packagesDir, 'qwik-dom');
  const pkgJson = await readPackageJson(pkgJsonPath);
  return pkgJson.version;
}
