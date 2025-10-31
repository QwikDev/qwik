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
} from './util';

/**
 * Build the core package which is also the root package: @qwik.dev/core
 *
 * Uses esbuild during development (cuz it's super fast) and TSC + Rollup + Terser for production,
 * because it generates smaller code that minifies better.
 */
export function submoduleCore(config: BuildConfig) {
  if (config.dev) {
    return submoduleCoreDev(config);
  }
  return submoduleCoreProd(config);
}

async function submoduleCoreProd(config: BuildConfig) {
  const input: InputOptions = {
    input: join(config.tscDir, 'packages', 'qwik', 'src', 'core', 'index.js'),
    onwarn: rollupOnWarn,
    external: ['@qwik.dev/core/build', '@qwik.dev/core/preloader'],
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

  const inputCore = join(config.distQwikPkgDir, 'core.mjs');
  const inputMin: InputOptions = {
    external: ['@qwik.dev/core/preloader'],
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
            compress: {
              module: true,
              toplevel: true,
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
              ecma: 2020,
              passes: 3,
              pure_getters: true,
              unsafe_symbols: true,
              keep_fargs: false,
            },
            mangle: {
              toplevel: true,
              module: true,
              properties: {
                regex: '^\\$.+\\$$',
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

  let esmCode = await readFile(join(config.distQwikPkgDir, 'core.mjs'), 'utf-8');
  await submoduleCoreProduction(config, esmCode, join(config.distQwikPkgDir, 'core.prod.mjs'));
}

async function submoduleCoreProduction(config: BuildConfig, code: string, outPath: string) {
  const result = await minify(code, {
    compress: {
      pure_getters: true,
      unsafe_symbols: true,
      keep_fargs: false,
      join_vars: false,

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
    mangle: false,
  });
  code = result.code!;

  await writeFile(outPath, code + '\n');
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
    external: ['@qwik.dev/core/build', '@qwik.dev/core/preloader'],
    format: 'esm',
    outExtension: { '.js': '.mjs' },
  });

  await Promise.all([esm]);

  // Point the minified and prod versions to the dev versions
  await writeFile(join(config.distQwikPkgDir, 'core.prod.mjs'), `export * from './core.mjs';\n`);
  await writeFile(join(config.distQwikPkgDir, 'core.min.mjs'), `export * from './core.mjs';\n`);

  console.log('🐬', submodule, '(dev)');
}
