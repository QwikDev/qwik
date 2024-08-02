import { access, type BuildConfig, writeFile } from './util';
import { join } from 'node:path';
import { platformArchTriples } from '@napi-rs/triples';
import { constants, existsSync } from 'node:fs';
import { inlineQwikScriptsEsBuild } from './submodule-qwikloader';
import { build, loadConfigFromFile } from 'vite';

/** Builds @builder.io/qwik/optimizer */
export async function submoduleOptimizer(config: BuildConfig) {
  const { optimizerDir } = config;
  const submodule = 'optimizer';

  await generatePlatformBindingsData(config);

  const optimizerConfig = (await loadConfigFromFile(
    { command: 'build', mode: 'ssr', isSsrBuild: true },
    join(optimizerDir, 'vite.config.ts')
  ))!;
  optimizerConfig.config.root = optimizerDir;
  optimizerConfig.config.build!.write = true;
  optimizerConfig.config.define!['globalThis.QWIK_VERSION'] = JSON.stringify(config.distVersion);
  optimizerConfig.config.clearScreen = false;
  await build(optimizerConfig.config);

  // const qwikloaderScripts = await inlineQwikScriptsEsBuild(config);

  console.log('🐹', submodule);
}

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

  const platformBindingPath = join(config.optimizerDir, 'src', 'qwik-binding-map.ts');
  let isWritable = false;
  try {
    await access(platformBindingPath, constants.W_OK);
    isWritable = true;
  } catch {}
  if (isWritable) {
    await writeFile(platformBindingPath, code);
  }
}
