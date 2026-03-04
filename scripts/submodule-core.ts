import { build, type BuildOptions } from 'esbuild';
import { join } from 'node:path';
import { type InputOptions, type OutputOptions, rollup } from 'rollup';
import { minify } from 'terser';
import {
  type BuildConfig,
  fileSize,
  getBanner,
  readFile,
  rollupOnWarn,
  target,
  writeFile,
} from './util.ts';

/**
 * Regex for property names that should be mangled consistently across all bundles (core + server).
 * Properties matching $...$ are internal framework properties not part of the public API.
 */
export const MANGLE_PROPS_REGEX = '^\\$.+\\$$';

/**
 * Build the core package which is also the root package: @qwik.dev/core
 *
 * Uses esbuild during development (cuz it's super fast) and TSC + Rollup + Terser for production,
 * because it generates smaller code that minifies better.
 *
 * In production, returns a Terser nameCache so the server bundle can apply the same property
 * mangling and keep $...$ names in sync across both bundles.
 */
export async function submoduleCore(config: BuildConfig): Promise<object | undefined> {
  if (config.dev) {
    await submoduleCoreDev(config);
    return undefined;
  }
  return submoduleCoreProd(config);
}

async function submoduleCoreProd(config: BuildConfig): Promise<object> {
  const input: InputOptions = {
    input: join(config.tscDir, 'packages', 'qwik', 'src', 'core', 'index.js'),
    onwarn: rollupOnWarn,
    external: ['@qwik.dev/core/build', '@qwik.dev/core/preloader', 'node:async_hooks'],
    plugins: [
      {
        name: 'setVersion',
        generateBundle(_, bundles) {
          for (const f in bundles) {
            const b = bundles[f];
            if (b.type === 'chunk') {
              b.code = b.code.replace(
                'globalThis.QWIK_VERSION',
                JSON.stringify(config.distVersion)
              );
            }
          }
        },
      },
    ],
  };

  const esmOutput: OutputOptions = {
    dir: join(config.distQwikPkgDir),
    format: 'es',
    entryFileNames: 'core.mjs',
    sourcemap: true,
    banner: getBanner('@qwik.dev/core', config.distVersion),
  };

  const build = await rollup(input);

  await Promise.all([build.write(esmOutput)]);

  console.log('🦊 core.mjs:', await fileSize(join(config.distQwikPkgDir, 'core.mjs')));

  // Shared nameCache so that $...$  property mangling is consistent across all Terser runs
  // (core.min.mjs, core.prod.mjs) and can later be reused for the server bundle.
  const nameCache: object = {};

  const inputCore = join(config.distQwikPkgDir, 'core.mjs');
  const inputMin: InputOptions = {
    external: ['@qwik.dev/core/preloader', 'node:async_hooks'],
    input: inputCore,
    onwarn: rollupOnWarn,
    plugins: [
      {
        name: 'build',
        resolveId(id) {
          if (id === '@index.min') {
            return id;
          }
          if (id === '@qwik.dev/core/build') {
            return id;
          }
        },
        load(id) {
          if (id === '@qwik.dev/core/build') {
            return `
              export const isServer = false;
              export const isBrowser = true;
              export const isDev = false;
            `;
          }
        },
      },
    ],
  };
  const buildMin = await rollup(inputMin);
  await buildMin.write({
    dir: join(config.distQwikPkgDir),
    format: 'es',
    entryFileNames: 'core.min.mjs',
    plugins: [
      {
        name: 'minify',
        async renderChunk(code) {
          const esmMinifyResult = await minify(code, {
            module: true,
            toplevel: true,
            nameCache,
            compress: {
              defaults: true,
              hoist_funs: true,
              keep_fargs: false,
              pure_getters: true,
              pure_new: true,
              toplevel: true,
              unsafe_arrows: true,
              unsafe_math: true,
              unsafe_symbols: true,
              unsafe: true,

              passes: 3,
              ecma: 2020,
              module: true,

              global_defs: {
                // special global that when set to false will remove all dev code entirely
                // developer production builds could use core.min.js directly, or setup
                // their own build tools to define the global `qwikDev` to false
                'globalThis.qDev': false,
                'globalThis.qInspector': false,
                'globalThis.qSerialize': false,
                'globalThis.qDynamicPlatform': false,
                'globalThis.qTest': false,
                'globalThis.qRuntimeQrl': false,
                'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
              },
            },
            mangle: {
              toplevel: true,
              module: true,
              properties: {
                regex: MANGLE_PROPS_REGEX,
              },
            },
            format: {
              comments: /__PURE__/,
              preserve_annotations: true,
              ecma: 2020,
            },
          });
          const esmMinCode = esmMinifyResult.code!;
          const esmCleanCode = esmMinCode.replace(/__self__/g, '__SELF__');

          const selfIdx = esmCleanCode.indexOf('self');
          const indx = Math.max(selfIdx);
          if (indx !== -1) {
            throw new Error(
              `"core.min.mjs" should not have any global references, and should have been removed for a production minified build\n` +
                esmCleanCode.substring(indx, indx + 10) +
                '\n' +
                esmCleanCode.substring(indx - 100, indx + 300)
            );
          }
          return {
            code: esmCleanCode,
          };
        },
      },
    ],
  });

  console.log('🐭 core.min.mjs:', await fileSize(join(config.distQwikPkgDir, 'core.min.mjs')));

  const prodCode = await prepareProdCode(config);
  await submoduleCoreProduction(
    config,
    prodCode,
    join(config.distQwikPkgDir, 'core.prod.mjs'),
    nameCache
  );

  return nameCache;
}

/**
 * Rollup pass on core.mjs that inlines only `isDev = false` from `@qwik.dev/core/build`, while
 * keeping `isServer` and `isBrowser` as dynamic imports (the build is universal — it must work on
 * both server and browser). `isServer`/`isBrowser` are re-exported from an internal alias that
 * rollup renames back to `@qwik.dev/core/build` in `output.paths`.
 */
async function prepareProdCode(config: BuildConfig): Promise<string> {
  const VIRTUAL_BUILD = '\0prod-build';

  const inputProd: InputOptions = {
    input: join(config.distQwikPkgDir, 'core.mjs'),
    external: ['@qwik.dev/core/preloader', 'node:async_hooks'],
    onwarn: rollupOnWarn,
    plugins: [
      {
        name: 'inlineProdIsDev',
        resolveId(id, importer) {
          if (id === '@qwik.dev/core/build') {
            // When the virtual itself re-imports @qwik.dev/core/build, keep it external.
            if (importer === VIRTUAL_BUILD) {
              return { id, external: true };
            }
            return VIRTUAL_BUILD;
          }
        },
        load(id) {
          if (id === VIRTUAL_BUILD) {
            return `
              export { isServer, isBrowser } from '@qwik.dev/core/build';
              export const isDev = false;
            `;
          }
        },
      },
    ],
  };

  const prodBuild = await rollup(inputProd);
  const chunks: string[] = [];
  await prodBuild.generate({
    format: 'es',
    plugins: [
      {
        name: 'collect',
        generateBundle(_, bundles) {
          for (const f in bundles) {
            const b = bundles[f];
            if (b.type === 'chunk') {
              chunks.push(b.code);
            }
          }
        },
      },
    ],
  });

  return chunks.join('\n');
}

async function submoduleCoreProduction(
  config: BuildConfig,
  code: string,
  outPath: string,
  nameCache: object
) {
  const result = await minify(code, {
    nameCache,
    compress: {
      defaults: false,
      booleans: true,
      conditionals: true,
      dead_code: true,
      evaluate: true,
      hoist_props: true,
      keep_classnames: true,
      keep_fargs: false,
      keep_fnames: true,
      keep_infinity: true,
      loops: true,
      properties: true,
      pure_getters: true,
      pure_new: true,
      reduce_funcs: true,
      reduce_vars: true,
      side_effects: true,
      toplevel: true,
      unsafe_arrows: true,
      unsafe_math: true,
      unsafe_symbols: true,
      unsafe: true,
      unused: true,

      passes: 3,
      ecma: 2020,
      module: true,

      global_defs: {
        'globalThis.qDev': false,
        'globalThis.qInspector': false,
        'globalThis.qSerialize': true,
        'globalThis.qDynamicPlatform': true,
        'globalThis.qTest': false,
        'globalThis.qRuntimeQrl': false,
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      },
    },
    format: {
      beautify: true,
      braces: true,
      comments: /__PURE__/,
      preserve_annotations: true,
      ecma: 2020,
      preamble: getBanner('@qwik.dev/core', config.distVersion),
    },
    mangle: {
      toplevel: true,
      module: true,
      properties: {
        regex: MANGLE_PROPS_REGEX,
      },
    },
  });
  code = result.code!;

  await writeFile(outPath, code + '\n');

  console.log('🦝 core.prod.mjs:', await fileSize(join(config.distQwikPkgDir, 'core.prod.mjs')));
}

async function submoduleCoreDev(config: BuildConfig) {
  const submodule = 'core';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    entryNames: submodule,
    outdir: config.distQwikPkgDir,
    bundle: true,
    sourcemap: 'external',
    target,
    define: {
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  };

  const esm = await build({
    ...opts,
    external: ['@qwik.dev/core/build', '@qwik.dev/core/preloader', 'node:async_hooks'],
    format: 'esm',
    outExtension: { '.js': '.mjs' },
  });

  await Promise.all([esm]);

  // Point the minified and prod versions to the dev versions
  await writeFile(join(config.distQwikPkgDir, 'core.prod.mjs'), `export * from './core.mjs';\n`);
  await writeFile(join(config.distQwikPkgDir, 'core.min.mjs'), `export * from './core.mjs';\n`);

  console.log('🐬', submodule, '(dev)');
}
