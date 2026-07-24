import { build, transform, type BuildOptions } from 'esbuild';
import { join } from 'node:path';
import { type InputOptions, type OutputOptions, rolldown } from 'rolldown';
import {
  type BuildConfig,
  ESBUILD_BASE,
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

export type MangleCache = Record<string, string | false>;

const devStripDefine = (config: BuildConfig, dynamicPlatform: boolean): Record<string, string> => ({
  'globalThis.qDev': 'false',
  'globalThis.qInspector': 'false',
  'globalThis.qDynamicPlatform': String(dynamicPlatform),
  'globalThis.qTest': 'false',
  'globalThis.qRuntimeQrl': 'false',
  'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
});

async function esbuildMinify(
  code: string,
  opts: { minifyIdentifiers: boolean; mangleCache: MangleCache | undefined }
): Promise<{ code: string; mangleCache: MangleCache | undefined }> {
  const result = await transform(code, {
    ...ESBUILD_BASE,
    minifySyntax: true,
    minifyIdentifiers: opts.minifyIdentifiers,
    legalComments: 'none',
    drop: ['debugger'],
    ...(opts.mangleCache
      ? {
          mangleProps: new RegExp(MANGLE_PROPS_REGEX),
          mangleQuoted: true,
          mangleCache: opts.mangleCache,
        }
      : {}),
  });
  return { code: result.code, mangleCache: result.mangleCache ?? opts.mangleCache };
}

/**
 * Build the core package which is also the root package: @qwik.dev/core
 *
 * Uses esbuild during development (cuz it's super fast) and TSC + Rolldown + esbuild for
 * production, because it generates smaller code that minifies better.
 *
 * In production, returns an esbuild mangleCache so the server bundle can apply the same property
 * mangling and keep $...$ names in sync across both bundles.
 */
export async function submoduleCore(config: BuildConfig): Promise<MangleCache | undefined> {
  if (config.dev) {
    await submoduleCoreDev(config);
    return undefined;
  }
  return submoduleCoreProd(config);
}

async function submoduleCoreProd(config: BuildConfig): Promise<MangleCache | undefined> {
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

  const build = await rolldown(input);

  await build.write(esmOutput);

  console.log('🦊 core.mjs:', await fileSize(join(config.distQwikPkgDir, 'core.mjs')));

  // Shared esbuild mangleCache so that $...$ property mangling is consistent across all bundles
  // (core.min.mjs, core.prod.mjs) and can later be reused for the server bundle.
  // When mangle=false (--mangle=false), skip mangling.
  const noMangle = config.mangle === false;
  let mangleCache: MangleCache | undefined = noMangle ? undefined : {};

  const inputCore = join(config.distQwikPkgDir, 'core.mjs');
  const inputMin: InputOptions = {
    external: ['@qwik.dev/core/preloader', 'node:async_hooks'],
    input: inputCore,
    onwarn: rollupOnWarn,
    transform: { define: devStripDefine(config, false) },
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
  const buildMin = await rolldown(inputMin);
  await buildMin.write({
    dir: join(config.distQwikPkgDir),
    format: 'es',
    entryFileNames: 'core.min.mjs',
    plugins: [
      {
        name: 'minify',
        async renderChunk(code) {
          const esmMinifyResult = await esbuildMinify(code, {
            minifyIdentifiers: true,
            mangleCache,
          });
          mangleCache = esmMinifyResult.mangleCache;
          const esmMinCode = esmMinifyResult.code;
          const esmCleanCode = esmMinCode.replace(/__self__/g, '__SELF__');
          validateNoBareExperimentalReferences(esmCleanCode, 'core.min.mjs');

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
  mangleCache = await submoduleCoreProduction(
    config,
    prodCode,
    join(config.distQwikPkgDir, 'core.prod.mjs'),
    mangleCache
  );

  return mangleCache;
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
    transform: { define: devStripDefine(config, true) },
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

  const prodBuild = await rolldown(inputProd);
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
  mangleCache: MangleCache | undefined
): Promise<MangleCache | undefined> {
  const minified = await esbuildMinify(code, {
    minifyIdentifiers: false,
    mangleCache,
  });
  const prodCode = `${getBanner('@qwik.dev/core', config.distVersion)}\n${minified.code}`;
  validateNoBareExperimentalReferences(prodCode, 'core.prod.mjs');

  await writeFile(outPath, prodCode + '\n');

  console.log('🦝 core.prod.mjs:', await fileSize(join(config.distQwikPkgDir, 'core.prod.mjs')));
  return minified.mangleCache;
}

function validateNoBareExperimentalReferences(code: string, filename: string) {
  const bareExperimentalReference = /(?<![\w$.])__EXPERIMENTAL__(?![\w$.])/;
  const match = bareExperimentalReference.exec(code);
  if (match) {
    const index = match.index;
    throw new Error(
      `"${filename}" should only reference experimental flags as "__EXPERIMENTAL__.feature".\n` +
        code.substring(Math.max(0, index - 100), index + 300)
    );
  }
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

  await build({
    ...opts,
    external: ['@qwik.dev/core/build', '@qwik.dev/core/preloader', 'node:async_hooks'],
    format: 'esm',
    outExtension: { '.js': '.mjs' },
  });

  // Point the minified and prod versions to the dev versions
  await writeFile(join(config.distQwikPkgDir, 'core.prod.mjs'), `export * from './core.mjs';\n`);
  await writeFile(join(config.distQwikPkgDir, 'core.min.mjs'), `export * from './core.mjs';\n`);

  console.log('🐬', submodule, '(dev)');
}
