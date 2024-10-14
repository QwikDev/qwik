import { build, type BuildOptions } from 'esbuild';
import { join } from 'node:path';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { type BuildConfig, getBanner, importPath, nodeTarget, target } from './util';

/**
 * Builds @qwik.dev/core/insights
 *
 * This is submodule for Qwik Insights vite plugin and component.
 */
export async function submoduleInsights(config: BuildConfig) {
  const submodule = 'insights';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    entryNames: 'insights',
    outdir: config.distQwikPkgDir,
    sourcemap: config.dev,
    bundle: true,
    platform: 'node',
    target,
    external: ['@qwik.dev/core/build'],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@qwik.dev/core/insights', config.distVersion) },
    outExtension: { '.js': '.mjs' },
    plugins: [
      importPath(/^@qwik\.dev\/core$/, '../core.mjs'),
      importPath(/^@qwik\.dev\/core\/optimizer$/, '../optimizer.mjs'),
    ],
    define: {
      ...(await inlineQwikScriptsEsBuild(config)),
      'globalThis.IS_CJS': 'false',
      'globalThis.IS_ESM': 'true',
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  });

  const cjsBanner = [
    getBanner('@qwik.dev/core/insights', config.distVersion),
    `globalThis.qwikInsights = (function (module) {`,
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

  console.log('📈', submodule);
}
