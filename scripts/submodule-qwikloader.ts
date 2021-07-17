import { InputOptions, OutputOptions, rollup, Plugin } from 'rollup';
import { minify, MinifyOptions } from 'terser';
import { BuildConfig, fileSize, rollupOnWarn } from './util';
import { statSync } from 'fs';
import { join } from 'path';
import { Optimizer } from '../src/optimizer';

export async function submoduleQwikLoader(config: BuildConfig) {
  const optimizer = new Optimizer({
    rootDir: config.rootDir,
  });

  const input: InputOptions = {
    input: 'src/qwikloader.ts',
    plugins: [
      {
        name: 'transpile',
        resolveId(id) {
          if (!id.endsWith('.ts')) {
            return join(config.srcDir, id + '.ts');
          }
          return null;
        },
        async transform(code, id) {
          const result = await optimizer.transformModule({
            text: code,
            filePath: id,
            module: 'es',
          });
          return result.text;
        },
      },
    ],
    onwarn: rollupOnWarn,
  };

  const defaultMinified: OutputOptions = {
    // QWIK_LOADER_DEFAULT_MINIFIED
    dir: config.pkgDir,
    format: 'es',
    exports: 'none',
    plugins: [
      terser({
        compress: {
          module: true,
          global_defs: {
            'globalThis.buildEvents': false,
          },
          keep_fargs: false,
          unsafe: true,
          passes: 2,
        },
        format: {
          comments: false,
        },
      }),
    ],
  };

  const defaultDebug: OutputOptions = {
    // QWIK_LOADER_DEFAULT_DEBUG
    dir: config.pkgDir,
    format: 'es',
    entryFileNames: `[name].debug.js`,
    exports: 'none',
    plugins: [
      terser({
        compress: {
          global_defs: {
            'globalThis.buildEvents': false,
          },
          inline: false,
          join_vars: false,
          loops: false,
          sequences: false,
        },
        format: {
          comments: false,
          beautify: true,
          braces: true,
        },
        mangle: false,
      }),
    ],
  };

  const optimizeMinified: OutputOptions = {
    // QWIK_LOADER_OPTIMIZE_MINIFIED
    dir: config.pkgDir,
    format: 'es',
    entryFileNames: `[name].optimize.js`,
    exports: 'none',
    plugins: [
      terser({
        compress: {
          module: true,
          global_defs: {
            'globalThis.buildEvents': true,
          },
          keep_fargs: false,
          unsafe: true,
          passes: 2,
        },
        format: {
          comments: false,
        },
      }),
    ],
  };

  const optimizeDebug: OutputOptions = {
    // QWIK_LOADER_OPTIMIZE_DEBUG
    dir: config.pkgDir,
    format: 'es',
    entryFileNames: `[name].optimize.debug.js`,
    exports: 'none',
    plugins: [
      terser({
        compress: {
          global_defs: {
            'globalThis.buildEvents': true,
          },
          inline: false,
          join_vars: false,
          loops: false,
          sequences: false,
        },
        format: {
          comments: false,
          beautify: true,
          braces: true,
        },
        mangle: false,
      }),
    ],
  };

  const build = await rollup(input);

  await Promise.all([
    build.write(defaultMinified),
    build.write(defaultDebug),
    build.write(optimizeMinified),
    build.write(optimizeDebug),
  ]);

  console.log('🚗 qwikloader:', await fileSize(join(config.pkgDir, 'qwikloader.optimize.js')));
}

function terser(opts: MinifyOptions): Plugin {
  return {
    name: 'terser',
    async generateBundle(_, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type === 'chunk') {
          const result = await minify(chunk.code, opts);
          chunk.code = result.code!;
        }
      }
    },
  };
}
