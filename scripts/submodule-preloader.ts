import { join } from 'node:path';
import { rollup, type InputOptions, type OutputOptions } from 'rollup';
import { fileSize, rollupOnWarn, type BuildConfig } from './util';
import { minify } from 'terser';
import { transform } from 'esbuild';

/**
 * Builds the qwikloader javascript files. These files can be used by other tooling, and are
 * provided in the package so CDNs could point to them. The @builder.io/optimizer submodule also
 * provides a utility function.
 */
export async function submodulePreloader(config: BuildConfig) {
  const input: InputOptions = {
    external: ['@builder.io/qwik/build'],
    input: join(config.srcQwikDir, 'core/preloader.ts'),
    onwarn: rollupOnWarn,
    plugins: [
      {
        name: 'qwikloaderTranspile',
        resolveId(id) {
          if (!id.endsWith('.ts')) {
            return join(config.srcQwikDir, id + '.ts');
          }
          return null;
        },
        async transform(code, id) {
          const result = await transform(code, {
            sourcefile: id,
            target: 'es2017',
            format: 'esm',
            loader: 'ts',
          });

          // Rename $properties$ to short names but leave the rest legible
          // The final app will minify it when needed
          const minified = await minify(result.code, {
            compress: false,
            mangle: {
              toplevel: false,
              module: false,
              properties: {
                regex: '^\\$.+\\$$',
              },
            },
          });
          return minified.code;
        },
      },
    ],
  };

  const output: OutputOptions = {
    dir: config.distQwikPkgDir,
    format: 'es',
    entryFileNames: `preloader.mjs`,
    exports: 'named',
  };

  const build = await rollup(input);

  await build.write(output);

  const preloaderSize = await fileSize(join(config.distQwikPkgDir, 'preloader.mjs'));
  console.log(`🐮 preloader:`, preloaderSize);
}
