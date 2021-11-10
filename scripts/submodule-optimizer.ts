import { build, BuildOptions } from 'esbuild';
import { BuildConfig, banner, nodeTarget, target, watcher, writeFile, readFile } from './util';
import { join } from 'path';
import { minify } from 'terser';
import { platformArchTriples } from '@napi-rs/triples';
import { readPackageJson } from './package-json';
import { watch } from 'rollup';

/**
 * Builds @builder.io/optimizer
 */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';

  await generatePlatformBindingsData(config);

  async function buildOptimizer() {
    const opts: BuildOptions = {
      entryPoints: [join(config.srcDir, submodule, 'src', 'index.ts')],
      entryNames: 'optimizer',
      outdir: config.distPkgDir,
      bundle: true,
      sourcemap: false,
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
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
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
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
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
              collapse_vars: false,
              drop_debugger: false,
              expression: false,
              keep_classnames: true,
              inline: false,
              if_return: false,
              join_vars: false,
              loops: false,
              passes: 1,
              reduce_funcs: false,
              reduce_vars: false,
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

async function generatePlatformBindingsData(config: BuildConfig) {
  // generate the platform binding information for only what qwik provides
  // allows us to avoid using a file system in the optimizer, take a look at:
  // - node_modules/@node-rs/helper/lib/loader.js
  // - node_modules/@napi-rs/triples/index.js

  const pkg = await readPackageJson(config.rootDir);

  const qwikArchTriples: typeof platformArchTriples = {};

  for (const platformName in platformArchTriples) {
    const platform = platformArchTriples[platformName];
    for (const archName in platform) {
      const triples = platform[archName];
      for (const triple of triples) {
        const qwikArchABI = `qwik.${triple.platformArchABI}.node`;
        if (pkg.files.includes(qwikArchABI)) {
          const qwikTriple = {
            platform: triple.platform,
            arch: triple.arch,
            abi: triple.abi,
            platformArchABI: qwikArchABI,
          };

          qwikArchTriples[platformName] = qwikArchTriples[platformName] || {};
          qwikArchTriples[platformName][archName] = qwikArchTriples[platformName][archName] || [];
          qwikArchTriples[platformName][archName].push(qwikTriple as any);
        }
      }
    }
  }

  const c: string[] = [];
  c.push(`// AUTO-GENERATED IN OPTIMIZER BUILD SCRIPT`);
  c.push(`// created from data provided by @napi-rs/triples`);
  c.push(``);
  c.push(`// prettier-ignore`);
  c.push(`export const QWIK_BINDING_MAP = ${JSON.stringify(qwikArchTriples, null, 2)};`);

  const code = c.join('\n') + '\n';

  const platformBindingPath = join(config.srcDir, 'optimizer', 'src', 'qwik-binding-map.ts');
  await writeFile(platformBindingPath, code);
}
