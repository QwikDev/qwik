import { BuildConfig, injectGlobalThisPoly, rollupOnWarn } from './util';
import { build, BuildOptions } from 'esbuild';
import { getBanner, fileSize, readFile, target, watcher, writeFile } from './util';
import { InputOptions, OutputOptions, rollup } from 'rollup';
import { join } from 'node:path';
import { minify } from 'terser';

/**
 * Build the core package which is also the root package: @builder.io/qwik
 *
 * Uses esbuild during development (cuz it's super fast) and
 * TSC + Rollup + Terser for production, because it generates smaller code
 * that minifies better.
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
    dir: join(config.distPkgDir),
    format: 'es',
    entryFileNames: 'core.mjs',
    sourcemap: true,
    banner: getBanner('@builder.io/qwik', config.distVersion),
  };

  const cjsIntro = [
    ,
    /**
     * Quick and dirty polyfill so globalThis is a global (really only needed for cjs and Node10)
     * and globalThis is only needed so globalThis.qDev can be set, and for dev dead code removal
     */
    injectGlobalThisPoly(),
  ].join('');

  const cjsOutput: OutputOptions = {
    dir: join(config.distPkgDir),
    format: 'umd',
    name: 'qwikCore',
    entryFileNames: 'core.cjs',
    sourcemap: true,
    banner: getBanner('@builder.io/qwik', config.distVersion),
    intro: cjsIntro,
  };

  const build = await rollup(input);

  await Promise.all([build.write(esmOutput), build.write(cjsOutput)]);

  console.log('🦊 core.mjs:', await fileSize(join(config.distPkgDir, 'core.mjs')));

  let esmCode = await readFile(join(config.distPkgDir, 'core.mjs'), 'utf-8');
  const esmMinifyResult = await minify(esmCode, {
    module: true,
    compress: {
      global_defs: {
        // special global that when set to false will remove all dev code entirely
        // developer production builds could use core.min.js directly, or setup
        // their own build tools to define the globa `qwikDev` to false
        'globalThis.qDev': false,
        'globalThis.qSerialize': false,
        'globalThis.qDynamicPlatform': false,
        'globalThis.qTest': false,
        'globalThis.qRuntimeQrl': false,
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      },
      ecma: 2020,
      passes: 3,
    },
    mangle: {
      toplevel: true,
      properties: {
        regex: '^\\$.+\\$$',
      },
    },
    format: {
      comments: /__PURE__/,
      preserve_annotations: true,
      preamble: getBanner('@builder.io/qwik', config.distVersion),
      ecma: 2020,
    },
  });

  const esmMinFile = join(config.distPkgDir, 'core.min.mjs');
  const esmMinCode = esmMinifyResult.code!;
  await writeFile(esmMinFile, esmMinCode);
  const esmCleanCode = esmMinCode.replace(/__self__/g, '__SELF__');

  // const windowIdx = esmCleanCode.indexOf('window');
  const selfIdx = esmCleanCode.indexOf('self');
  const indx = Math.max(selfIdx);
  if (indx !== -1) {
    throw new Error(
      `"${esmMinFile}" should not have any global references, and should have been removed for a production minified build\n` +
        esmCleanCode.substring(indx, indx + 20)
    );
  }
  console.log('🐭 core.min.mjs:', await fileSize(esmMinFile));

  await writeFile(join(config.distPkgDir, 'core.mjs'), esmCode);

  // always set the cjs version (probably imported serverside) to dev mode
  let cjsCode = await readFile(join(config.distPkgDir, 'core.cjs'), 'utf-8');
  await writeFile(join(config.distPkgDir, 'core.cjs'), cjsCode);

  await submoduleCoreProduction(config, esmCode, join(config.distPkgDir, 'core.prod.mjs'));
  await submoduleCoreProduction(config, cjsCode, join(config.distPkgDir, 'core.prod.cjs'));
}

async function submoduleCoreProduction(config: BuildConfig, code: string, outPath: string) {
  const result = await minify(code, {
    compress: {
      booleans: false,
      collapse_vars: true,
      dead_code: true,
      inline: true,
      join_vars: false,
      passes: 3,
      reduce_vars: true,
      side_effects: true,
      toplevel: true,
      unused: true,
      global_defs: {
        'globalThis.qDev': false,
        'globalThis.qSerialize': true,
        'globalThis.qDynamicPlatform': true,
        'globalThis.qTest': false,
        'globalThis.qRuntimeQrl': false,
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      },
    },
    format: {
      comments: false,
      beautify: true,
      braces: true,
      preamble: getBanner('@builder.io/qwik', config.distVersion),
    },
    mangle: false,
  });
  code = result.code!;

  await writeFile(outPath, code + '\n');
}

async function submoduleCoreDev(config: BuildConfig) {
  const submodule = 'core';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    entryNames: submodule,
    outdir: config.distPkgDir,
    bundle: true,
    sourcemap: 'external',
    target,
    define: {
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    watch: watcher(config, submodule),
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    watch: watcher(config),
    banner: {
      js: `${injectGlobalThisPoly()}\nglobalThis.qwikCore = (function (module) {`,
    },
    footer: {
      js: `return module.exports; })(typeof module === 'object' && module.exports ? module : { exports: {} });`,
    },
  });

  await Promise.all([esm, cjs]);

  console.log('🐬', submodule, '(dev)');
}
