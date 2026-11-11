import { build } from 'esbuild';
import { join } from 'node:path';
import type { Plugin as RolldownPlugin } from 'rolldown';
import { readPackageJson } from './package-json.ts';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader.ts';
import { inlineBackpatchScriptsEsBuild } from './submodule-backpatch.ts';
import { type BuildConfig, target } from './util.ts';

/**
 * What `@qwik.dev/core/server` needs on top of core's library build, which bundles it as an entry
 * so it shares core's modules: the bundled DOM and the inlined loader and backpatch scripts. Needs
 * the qwikloader and backpatch builds first.
 */
export async function serverSourceOptions(config: BuildConfig) {
  const qwikDom = await bundleQwikDom(config);
  const qwikDomPlugin: RolldownPlugin = {
    name: 'qwikDom',
    resolveId(id) {
      if (id === '@qwik.dev/dom') {
        return qwikDom;
      }
    },
  };
  // Inlined into the output: rolldown's `define` misses the sources' `(globalThis as any).NAME`.
  const globals: Record<string, string> = {
    ...(await inlineQwikScriptsEsBuild(config)),
    ...(await inlineBackpatchScriptsEsBuild(config)),
    'globalThis.QWIK_DOM_VERSION': JSON.stringify(await getQwikDomVersion(config)),
  };
  return { plugins: [qwikDomPlugin], globals };
}

async function bundleQwikDom(config: BuildConfig) {
  const outfile = join(config.tmpDir, 'qwikdom.mjs');
  await build({
    entryPoints: [join(config.packagesDir, 'qwik-dom', 'lib', 'index.js')],
    sourcemap: false,
    minify: !config.dev,
    bundle: true,
    target,
    outfile,
    format: 'esm',
  });
  return outfile;
}

async function getQwikDomVersion(config: BuildConfig) {
  const pkgJson = await readPackageJson(join(config.packagesDir, 'qwik-dom'));
  return pkgJson.version;
}
