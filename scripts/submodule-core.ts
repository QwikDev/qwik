import { BuildConfig, injectGlobalThisPoly } from './util';
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
  };

  const esmOutput: OutputOptions = {
    dir: join(config.pkgDir),
    format: 'es',
    entryFileNames: 'core.mjs',
    sourcemap: true,
  };

  const cjsOutput: OutputOptions = {
    dir: join(config.pkgDir),
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

  console.log('🤖 core.mjs:', await fileSize(join(config.pkgDir, 'core.mjs')));

  const esmCode = await readFile(join(config.pkgDir, 'core.mjs'), 'utf-8');
  const minifyResult = await minify(esmCode, {
    module: true,
    compress: {
      global_defs: {
        // special global that when set to false will remove all dev code entirely
        // developer production builds could use core.min.js directly, or setup
        // their own build tools to define the globa `qwikDev` to false
        'globalThis.qDev': false,
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

  const minFile = join(config.pkgDir, 'core.min.mjs');
  const minCode = minifyResult.code!;
  await writeFile(minFile, minCode);

  if (
    minCode.includes('window') ||
    minCode.includes(
      'self'
    ) /* || minCode.includes('global') // TODO(OPTIMIZER): Disable temporarily to make the tests work*/
  ) {
    throw new Error(
      `"${minFile}" should not have any global references, and should have been removed for a production minified build`
    );
  }

  console.log('👽 core.min.mjs:', await fileSize(minFile));
}

async function submoduleCoreDev(config: BuildConfig) {
  const submodule = 'core';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    entryNames: submodule,
    outdir: config.pkgDir,
    bundle: true,
    sourcemap: 'external',
    target,
    banner,
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
