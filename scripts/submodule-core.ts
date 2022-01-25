import { BuildConfig, injectGlobalThisPoly, rollupOnWarn } from './util';
import { banner, fileSize, readFile, target, watcher, writeFile } from './util';
import { build, BuildOptions } from 'esbuild';
import { InputOptions, OutputOptions, rollup } from 'rollup';
import { join } from 'path';
import { minify } from 'terser';
import { readFileSync } from 'fs';

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
    input: join(config.tscDir, 'src', 'core', 'index.js'),
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
  };

  const cjsOutput: OutputOptions = {
    dir: join(config.distPkgDir),
    format: 'cjs',
    entryFileNames: 'core.cjs',
    sourcemap: true,
    /**
     * Quick and dirty polyfill so globalThis is a global (really only needed for cjs and Node10)
     * and globalThis is only needed so globalThis.qDev can be set, and for dev dead code removal
     */
    intro: readFileSync(join(config.scriptsDir, 'shim', 'globalthis.js'), 'utf-8'),
  };

  const build = await rollup(input);

  await Promise.all([build.write(esmOutput), build.write(cjsOutput)]);

  console.log('🦊 core.mjs:', await fileSize(join(config.distPkgDir, 'core.mjs')));

  const esmCode = await readFile(join(config.distPkgDir, 'core.mjs'), 'utf-8');
  const minifyResult = await minify(esmCode, {
    module: true,
    compress: {
      global_defs: {
        // special global that when set to false will remove all dev code entirely
        // developer production builds could use core.min.js directly, or setup
        // their own build tools to define the globa `qwikDev` to false
        'globalThis.qDev': false,
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      },
      ecma: 2018,
      passes: 2,
    },
    format: {
      comments: false,
      preamble: banner.js,
      ecma: 2018,
    },
  });

  const minFile = join(config.distPkgDir, 'core.min.mjs');
  const minCode = minifyResult.code!;
  await writeFile(minFile, minCode);
  const cleanCode = minCode.replace(/__self__/g, '__SELF__');

  const windowIdx = cleanCode.indexOf('window');
  const selfIdx =
    cleanCode.indexOf(
      'self'
    ); /* || minCode.includes('global') // TODO(OPTIMIZER): Disable temporarily to make the tests work*/
  const indx = Math.max(windowIdx, selfIdx);
  if (indx !== -1) {
    throw new Error(
      `"${minFile}" should not have any global references, and should have been removed for a production minified build\n` +
        cleanCode.substring(indx, indx + 20)
    );
  }

  console.log('🐭 core.min.mjs:', await fileSize(minFile));
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
    banner,
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
    inject: [injectGlobalThisPoly(config)],
  });

  await Promise.all([esm, cjs]);

  console.log('🐬', submodule, '(dev)');
}
