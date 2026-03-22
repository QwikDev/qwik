import { platformArchTriples } from '@napi-rs/triples';
import { constants, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { build as viteBuild, type UserConfig } from 'vite';
import { compiledStringPlugin } from './compiled-string-plugin.ts';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader.ts';
import { access, getBanner, target, writeFile, type BuildConfig } from './util.ts';

/** Builds packages/optimizer and packages/qwik-vite */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';

  // Uncomment this to regenerate the platform binding map for the optimizer. This is only necessary when adding new platform bindings to qwik, and should be committed to source control.
  // await generatePlatformBindingsData(config);

  const entryPoint = join(config.qwikViteDir, 'index.ts');
  const optimizerEntryPoint = join(config.optimizerDir, 'index.ts');
  const qwikloaderScripts = await inlineQwikScriptsEsBuild(config);

  // Common Vite configuration
  const commonConfig = {
    clearScreen: false,
    resolve: {
      alias: [
        {
          find: /^image-size(?=\/|$)/,
          replacement: join(config.packagesDir, 'qwik', 'node_modules', 'image-size'),
        },
        {
          find: /^launch-editor$/,
          replacement: join(config.packagesDir, 'qwik', 'node_modules', 'launch-editor'),
        },
      ],
    },
    build: {
      emptyOutDir: false,
      sourcemap: false,
      target: target,
      minify: !config.dev, // Minify in production builds
      rollupOptions: {
        external: ['node:fs', 'node:path', 'launch-editor', '@qwik.dev/optimizer'],
      },
      lib: {
        entry: entryPoint,
        name: 'optimizer',
        fileName: () => `optimizer.mjs`,
      },
    },
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
  } as const satisfies UserConfig;

  // ESM Build
  const esmConfig: UserConfig = {
    ...commonConfig,
    build: {
      ...commonConfig.build,
      outDir: config.distQwikPkgDir,
      lib: {
        ...commonConfig.build!.lib,
        formats: ['es'],
      },
      rollupOptions: {
        ...commonConfig.build?.rollupOptions,
        output: {
          banner: getBanner('@qwik.dev/core/optimizer', config.distVersion),
        },
      },
    },
    define: {
      ...commonConfig.define,
    },
  };

  const optimizerConfig: UserConfig = {
    clearScreen: false,
    build: {
      emptyOutDir: false,
      outDir: join(config.optimizerPkgDir, 'dist'),
      sourcemap: false,
      target: target,
      minify: !config.dev,
      lib: {
        entry: optimizerEntryPoint,
        name: 'optimizer',
        fileName: () => `index.mjs`,
        formats: ['es'],
      },
      rollupOptions: {
        output: {
          banner: getBanner('@qwik.dev/optimizer', config.optimizerVersion),
        },
      },
    },
    define: {
      'globalThis.QWIK_VERSION': JSON.stringify(config.optimizerVersion),
    },
  };

  // Build both formats
  await Promise.all([viteBuild(esmConfig), viteBuild(optimizerConfig)]);

  const optimizerScopeDir = join(config.rootDir, 'node_modules', '@qwik.dev');
  const optimizerLinkPath = join(optimizerScopeDir, 'optimizer');
  mkdirSync(optimizerScopeDir, { recursive: true });
  rmSync(optimizerLinkPath, { force: true, recursive: true });
  symlinkSync(join('..', '..', 'packages', 'optimizer'), optimizerLinkPath, 'dir');

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

  const platformBindingPath = join(config.optimizerDir, 'qwik-binding-map.ts');
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
