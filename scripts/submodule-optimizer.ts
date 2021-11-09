import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import { BuildConfig, banner, nodeTarget, target, watcher, writeFile, readFile } from './util';
import { watch } from 'rollup';
import { minify } from 'terser';

/**
 * Builds @builder.io/optimizer
 */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';
  const optimizerDistDir = join(config.distPkgDir, submodule);

  async function buildOptimizer() {
    const opts: BuildOptions = {
      entryPoints: [join(config.srcDir, submodule, 'src', 'index.ts')],
      entryNames: 'optimizer',
      outdir: config.distPkgDir,
      bundle: true,
      sourcemap: config.dev,
      target,
      banner,
      external: [
        /* no nodejs built-in externals allowed! */
      ],
      incremental: config.watch,
    };

    const esmBuild = build({
      ...opts,
      format: 'esm',
      outExtension: { '.js': '.mjs' },
      define: {
        'globalThis.IS_CJS': 'false',
        'globalThis.IS_ESM': 'true',
      },
      watch: watcher(config, submodule),
    });

    const cjsBuild = build({
      ...opts,
      format: 'cjs',
      outExtension: { '.js': '.cjs' },
      define: {
        'globalThis.IS_CJS': 'true',
        'globalThis.IS_ESM': 'false',
      },
      watch: watcher(config),
      platform: 'node',
      target: nodeTarget,
    });

    const [esm, cjs] = await Promise.all([esmBuild, cjsBuild]);

    if (!config.dev) {
      const esmDist = join(config.distPkgDir, 'optimizer.mjs');
      const cjsDist = join(config.distPkgDir, 'optimizer.cjs');

      await Promise.all(
        [esmDist, cjsDist].map(async (p) => {
          const src = await readFile(p, 'utf-8');
          const result = await minify(src, {
            compress: {
              keep_classnames: true,
              inline: false,
              loops: false,
              passes: 1,
              drop_debugger: false,
            },
            format: {
              comments: false,
              braces: true,
              beautify: true,
              indent_level: 2,
            },
            mangle: false,
          });
          await writeFile(p, result.code!);
        })
      );
    }

    console.log('🐹', submodule);

    if (config.watch) {
      const watcher = watch({ input: join(config.distPkgDir, 'prefetch.debug.js') });
      watcher.on('change', () => {
        esm.stop!();
        cjs.stop!();
        watcher.close();
        setTimeout(buildOptimizer);
      });
    }
  }

  await Promise.all([buildOptimizer()]);
}
