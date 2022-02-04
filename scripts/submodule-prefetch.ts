import { InputOptions, OutputOptions, rollup, watch, OutputBundle } from 'rollup';
import { BuildConfig, fileSize, rollupOnWarn, terser } from './util';
import { join } from 'path';
import { transform } from 'esbuild';

/**
 * Builds the qwikloader javascript files. These files can be used
 * by other tooling, and are provided in the package so CDNs could
 * point to them. The @builder.io/optimizer submodule also provides
 * a utility function.
 */
export async function submodulePrefetch(config: BuildConfig) {
  const prefetchPath = join(config.srcDir, 'prefetch.ts');
  const prefetchWorkerPath = join(config.srcDir, 'prefetch-worker.ts');

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
            const result = await transform(code, { sourcefile: id, format: 'esm', loader: 'ts' });
            return result.code;
          },
        },
      ],
      onwarn: rollupOnWarn,
    });

    const generated = await build.generate({
      dir: config.distPkgDir,
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
          const result = await transform(code, { sourcefile: id, format: 'esm', loader: 'ts' });
          return result.code;
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
    dir: config.distPkgDir,
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
    dir: config.distPkgDir,
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

  const prefetchFileSize = await fileSize(join(config.distPkgDir, 'prefetch.js'));
  console.log('🐨 prefetch:', prefetchFileSize);

  if (config.watch) {
    watch({ ...input, output: [prefetchMinified, prefetchDebug] });
  }
}
