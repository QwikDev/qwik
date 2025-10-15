import { platformArchTriples } from '@napi-rs/triples';
import { constants, existsSync } from 'node:fs';
import { join } from 'node:path';
import { build as viteBuild } from 'vite';
import { compiledStringPlugin } from './compiled-string-plugin';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { access, getBanner, target, writeFile, type BuildConfig } from './util';

/** Builds @qwik.dev/core/optimizer */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';

  // uncomment this when adding a platform binding
  // await generatePlatformBindingsData(config);

  const entryPoint = join(config.optimizerDir, 'index.ts');
  const qwikloaderScripts = await inlineQwikScriptsEsBuild(config);

  await viteBuild({
    clearScreen: false,
    define: {
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
      ...qwikloaderScripts,
    },
    plugins: [
      compiledStringPlugin(),
      {
        name: 'forbid-core',
        enforce: 'pre',
        resolveId(id) {
          // throws an error if files from src/core are loaded, except for some allowed imports
          if (/src[/\\]core[\\/]/.test(id) && !id.includes('util') && !id.includes('shared')) {
            console.error('forbid-core', id);
            throw new Error('Import of core files is not allowed in server builds.');
          }
          return null;
        },
      },
    ],
    build: {
      emptyOutDir: false,
      sourcemap: false,
      target: target,
      minify: !config.dev, // Minify in production builds
      outDir: config.distQwikPkgDir,
      lib: {
        entry: entryPoint,
        name: 'optimizer',
        fileName: () => 'optimizer.mjs',
        formats: ['es'],
      },
      rollupOptions: {
        external: ['node:fs', 'node:path', 'launch-editor'],
        output: {
          banner: getBanner('@qwik.dev/core/optimizer', config.distVersion),
        },
      },
    },
  });

  // Note: Minification is now handled automatically by Vite in production builds
  // The output files will be minified when config.dev is false

  console.log('🐹', submodule);
}

// This function is only used when adding platform bindings
// Uncomment the call to generatePlatformBindingsData(config) above when needed
// export so that it can stay without being used
export async function generatePlatformBindingsData(config: BuildConfig) {
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
  } catch {
    isWritable = false;
  }
  if (isWritable) {
    await writeFile(platformBindingPath, code);
  }
}
