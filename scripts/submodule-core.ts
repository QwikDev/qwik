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
    external: ['@qwik.dev/core-external', '@qwik.dev/core/build'],
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
              b.code = b.code.replaceAll('@qwik.dev/core-external', '@qwik.dev/core');
            }
          }
        },
      },
    ],
  };

  const esmOutput: OutputOptions = {
    dir: join(config.distQwikPkgDir),
    format: 'es',
    entryFileNames: 'core.qwik.mjs',
    sourcemap: true,
    banner: getBanner('@qwik.dev/core', config.distVersion),
  };

  const cjsOutput: OutputOptions = {
    dir: join(config.distQwikPkgDir),
    format: 'umd',
    name: 'qwikCore',
    entryFileNames: 'core.qwik.cjs',
    sourcemap: true,
    globals: {
      '@qwik.dev/core/build': 'qwikBuild',
    },
    banner: getBanner('@qwik.dev/core', config.distVersion),
  };

  const build = await rollup(input);

  await Promise.all([build.write(esmOutput), build.write(cjsOutput)]);

  console.log('🦊 core.qwik.mjs:', await fileSize(join(config.distQwikPkgDir, 'core.qwik.mjs')));

  const inputCore = join(config.distQwikPkgDir, 'core.qwik.mjs');
  const inputMin: InputOptions = {
    input: inputCore,
    onwarn: rollupOnWarn,
    external: ['@qwik.dev/core-external'],
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
    entryFileNames: 'core.min.qwik.mjs',
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
              `"core.min.qwik.mjs" should not have any global references, and should have been removed for a production minified build\n` +
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

  console.log(
    '🐭 core.min.qwik.mjs:',
    await fileSize(join(config.distQwikPkgDir, 'core.min.qwik.mjs'))
  );

  let esmCode = await readFile(join(config.distQwikPkgDir, 'core.qwik.mjs'), 'utf-8');
  let cjsCode = await readFile(join(config.distQwikPkgDir, 'core.qwik.cjs'), 'utf-8');
  // fixup the Vite base url
  cjsCode = cjsCode.replaceAll('undefined.BASE_URL', 'globalThis.BASE_URL||"/"');
  await writeFile(join(config.distQwikPkgDir, 'core.qwik.cjs'), cjsCode);

  await submoduleCoreProduction(config, esmCode, join(config.distQwikPkgDir, 'core.prod.qwik.mjs'));
  await submoduleCoreProduction(config, cjsCode, join(config.distQwikPkgDir, 'core.prod.qwik.cjs'));
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

async function replaceQwikExternal(filePath: string) {
  const code = await readFile(filePath, 'utf-8');
  await writeFile(filePath, code.replaceAll('@qwik.dev/core-external', '@qwik.dev/core'));
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

  const esm = build({
    ...opts,
    external: ['@qwik.dev/core/build', '@qwik.dev/core-external'],
    format: 'esm',
    outExtension: { '.js': '.qwik.mjs' },
  });

  const cjs = build({
    ...opts,
    // we don't externalize qwik build because then the repl service worker sees require()
    external: ['@qwik.dev/core-external'],
    define: {
      ...opts.define,
      // Vite's base url
      'import.meta.env.BASE_URL': '"globalThis.BASE_URL||\'/\'"',
    },
    format: 'cjs',
    outExtension: { '.js': '.qwik.cjs' },
    banner: {
      js: `globalThis.qwikCore = (function (module) {`,
    },
    footer: {
      js: `return module.exports; })(typeof module === 'object' && module.exports ? module : { exports: {} });`,
    },
  });

  await Promise.all([esm, cjs]);

  await replaceQwikExternal(join(config.distQwikPkgDir, 'core.qwik.mjs'));
  await replaceQwikExternal(join(config.distQwikPkgDir, 'core.qwik.cjs'));

  // Point the minified and prod versions to the dev versions
  await writeFile(
    join(config.distQwikPkgDir, 'core.prod.qwik.mjs'),
    `export * from './core.qwik.mjs';\n`
  );
  await writeFile(
    join(config.distQwikPkgDir, 'core.prod.qwik.cjs'),
    `module.exports = require('./core.qwik.cjs');\n`
  );
  await writeFile(
    join(config.distQwikPkgDir, 'core.min.qwik.mjs'),
    `export * from './core.qwik.mjs';\n`
  );
  await writeFile(
    join(config.distQwikPkgDir, 'core.min.qwik.cjs'),
    `module.exports = require('./core.qwik.cjs');\n`
  );

  console.log('🐬', submodule, '(dev)');
}
