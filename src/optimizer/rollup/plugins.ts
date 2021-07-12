import type { Optimizer, OutputPlatform } from '../types';
import type { Plugin, OutputBundle } from 'rollup';

export function clientRollupPlugin(optimizer: Optimizer) {
  const plugin: Plugin = {
    name: 'qwikRollupClientPlugin',
    generateBundle(_opts, bundle) {
      rollupPostBuild(optimizer, bundle, 'client');
    },
  };
  return plugin;
}

export function serverRollupPlugin(optimizer: Optimizer) {
  const plugin: Plugin = {
    name: 'qwikRollupServerPlugin',
    generateBundle(_opts, bundle) {
      rollupPostBuild(optimizer, bundle, 'server');
    },
  };
  return plugin;
}

function rollupPostBuild(optimizer: Optimizer, bundle: OutputBundle, platform: OutputPlatform) {
  for (const f in bundle) {
    const out = bundle[f];
    if (out.type === 'chunk') {
      const postBuild = optimizer.postBuild({
        path: out.fileName,
        text: out.code,
        map: out.map,
        platform,
      });
      if (postBuild) {
        out.code = postBuild.text;
        out.map = postBuild.map;
      }
    }
  }
}
