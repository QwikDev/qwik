import { InputOptions, OutputOptions, rollup, Plugin, watch, OutputBundle } from 'rollup';
import { minify, MinifyOptions } from 'terser';
import { BuildConfig, fileSize, rollupOnWarn } from './util';
import { join } from 'path';
import { Optimizer } from '../src/optimizer';
import { readFileSync } from 'fs';

/**
 * Builds the qwikloader javascript files. These files can be used
 * by other tooling, and are provided in the package so CDNs could
 * point to them. The @builder.io/optimizer submodule also provides
 * a utility function.
 */
export async function submodulePrefetch(config: BuildConfig) {
  const prefetchPath = join(config.srcDir, 'prefetch.ts');
  const prefetchWorkerPath = join(config.srcDir, 'prefetch-worker.ts');

  const optimizer = new Optimizer({
    rootDir: config.rootDir,
  });

  async function generateWebWorkerBlob(minifyCode: boolean) {
    const build = await rollup({
      input: prefetchWorkerPath,
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
    });

    const generated = await build.generate({
      dir: config.pkgDir,
      format: 'es',
      exports: 'none',
      plugins: minifyCode
        ? [
            terser({
              compress: {
                module: true,
                keep_fargs: false,
                unsafe: true,
                passes: 2,
              },
              format: {
                comments: false,
              },
            }),
          ]
        : [],
    });

    return JSON.stringify(generated.output[0].code);
  }

  const input: InputOptions = {
    input: prefetchPath,
    plugins: [
      {
        name: 'transpile',
        resolveId(id) {
          this.addWatchFile(prefetchWorkerPath);
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

  async function generateBundle(bundle: OutputBundle, minifyCode: boolean) {
    for (const fileName in bundle) {
      const b = bundle[fileName];
      if (b.type === 'chunk') {
        const wwBlob = await generateWebWorkerBlob(minifyCode);
        b.code = b.code.replace('PREFETCH_WORKER_BLOB', wwBlob);
      }
    }
  }

  const prefetchMinified: OutputOptions = {
    dir: config.pkgDir,
    format: 'es',
    exports: 'none',
    plugins: [
      terser({
        compress: {
          module: true,
          keep_fargs: false,
          unsafe: true,
          passes: 2,
        },
        format: {
          comments: false,
        },
      }),
      {
        name: 'prefetchMinified',
        async generateBundle(_, bundle) {
          return generateBundle(bundle, true);
        },
      },
    ],
  };

  const prefetchDebug: OutputOptions = {
    dir: config.pkgDir,
    format: 'es',
    entryFileNames: `[name].debug.js`,
    exports: 'none',
    plugins: [
      terser({
        compress: {
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
      {
        name: 'prefetchDebug',
        async generateBundle(_, bundle) {
          return generateBundle(bundle, false);
        },
      },
    ],
  };

  const build = await rollup(input);
  await Promise.all([build.write(prefetchMinified), build.write(prefetchDebug)]);

  const prefetchFileSize = await fileSize(join(config.pkgDir, 'prefetch.js'));
  console.log('🦙 prefetch:', prefetchFileSize);

  if (config.watch) {
    watch({ ...input, output: [prefetchMinified, prefetchDebug] });
  }
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
