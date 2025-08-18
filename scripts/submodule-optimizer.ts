import { platformArchTriples } from '@napi-rs/triples';
import { build, type BuildOptions } from 'esbuild';
import RawPlugin from 'esbuild-plugin-raw';
import { constants, existsSync } from 'node:fs';
import { join } from 'node:path';
import { minify } from 'terser';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import {
  access,
  type BuildConfig,
  getBanner,
  nodeTarget,
  readFile,
  target,
  writeFile,
} from './util';

/** Builds @qwik.dev/core/optimizer */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';

  // uncomment this when adding a platform binding
  // await generatePlatformBindingsData(config);

  async function buildOptimizer() {
    const opts: BuildOptions = {
      entryPoints: [join(config.optimizerDir, 'index.ts')],
      entryNames: 'optimizer',
      outdir: config.distQwikPkgDir,
      bundle: true,
      sourcemap: false,
      platform: 'node',
      target,
    };

    const qwikloaderScripts = await inlineQwikScriptsEsBuild(config);

    const esmBuild = build({
      ...opts,
      format: 'esm',
      banner: { js: getBanner('@qwik.dev/core/optimizer', config.distVersion) },
      outExtension: { '.js': '.mjs' },
      define: {
        'globalThis.IS_CJS': 'false',
        'globalThis.IS_ESM': 'true',
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
        ...qwikloaderScripts,
      },
      plugins: [
        {
          // throws an error if files from src/core are loaded, except for some allowed imports
          name: 'forbid-core',
          setup(build) {
            build.onLoad({ filter: /src[\\/]core[\\/]/ }, (args) => {
              if (args.path.includes('util') || args.path.includes('shared')) {
                return null;
              }
              console.error('forbid-core', args);
              throw new Error('Import of core files is not allowed in server builds.');
            });
          },
        },
        RawPlugin(),
      ],
    });

    const cjsBanner = [`globalThis.qwikOptimizer = (function (module) {`].join('\n');

    const cjsBuild = build({
      ...opts,
      format: 'cjs',
      banner: { js: cjsBanner },
      footer: {
        js: `return module.exports; })(typeof module === 'object' && module.exports ? module : { exports: {} });`,
      },
      outExtension: { '.js': '.cjs' },
      define: {
        'globalThis.IS_CJS': 'true',
        'globalThis.IS_ESM': 'false',
        'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
        ...qwikloaderScripts,
      },
      target: nodeTarget,
      plugins: [RawPlugin()],
    });

    await Promise.all([esmBuild, cjsBuild]);

    if (!config.dev) {
      const esmDist = join(config.distQwikPkgDir, 'optimizer.mjs');
      const cjsDist = join(config.distQwikPkgDir, 'optimizer.cjs');

      await Promise.all(
        [esmDist, cjsDist].map(async (p) => {
          const src = await readFile(p, 'utf-8');
          const result = await minify(src, {
            compress: {
              booleans: false,
              collapse_vars: false,
              comparisons: false,
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
              sequences: false,
              switches: false,
            },
            format: {
              comments: false,
              braces: true,
              beautify: true,
              indent_level: 2,
              preamble: getBanner('@qwik.dev/core/optimizer', config.distVersion),
            },
            mangle: false,
          });
          await writeFile(p, result.code!);
        })
      );
    }

    console.log('🐹', submodule);
  }

  await Promise.all([buildOptimizer()]);
}

// @ts-expect-error -- we only use this when adding a platform binding
async function generatePlatformBindingsData(config: BuildConfig) {
  // generate the platform binding information for only what qwik provides
  // allows us to avoid using a file system in the optimizer, take a look at:
  // - node_modules/@node-rs/helper/lib/loader.js
  // - node_modules/@napi-rs/triples/index.js

  const qwikArchTriples: typeof platformArchTriples = {};

  for (const platformName in platformArchTriples) {
    const platform = platformArchTriples[platformName];
    for (const archName in platform) {
      const triples = platform[archName];
      for (const triple of triples) {
        const qwikArchABI = `qwik.${triple.platformArchABI}.node`;
        if (existsSync(join(config.distBindingsDir, qwikArchABI))) {
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

  const platformBindingPath = join(config.srcQwikDir, 'optimizer', 'src', 'qwik-binding-map.ts');
  let isWritable;
  try {
    await access(platformBindingPath, constants.W_OK);
    isWritable = true;
  } catch (e) {
    isWritable = false;
  }
  if (isWritable) {
    await writeFile(platformBindingPath, code);
  }
}
