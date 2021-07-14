import type { Optimizer, OutputPlatform } from '../types';
import type { BuildResult, Plugin } from 'esbuild';

export function clientEsbuildPlugin(optimizer: Optimizer) {
  const plugin: Plugin = {
    name: 'qwikEsbuildClientPlugin',
    setup(build) {
      if (!optimizer.isDev()) {
        build.onResolve({ filter: /@builder\.io\/qwik/ }, (args) => {
          const m = optimizer.resolveModuleSync({
            moduleName: args.path,
            containingFile: args.importer,
          });
          if (m.isExternalLibraryImport && m.resolvedFileName?.endsWith('core.mjs')) {
            return {
              path: m.resolvedFileName.replace('core.mjs', 'core.min.mjs'),
            };
          }
          return null;
        });
      }
      build.onEnd((result) => esbuildPostBuild(optimizer, result, 'client'));
    },
  };
  return plugin;
}

export function serverEsbuildPlugin(optimizer: Optimizer) {
  const plugin: Plugin = {
    name: 'qwikEsbuildServerPlugin',
    setup(build) {
      build.onEnd((result) => esbuildPostBuild(optimizer, result, 'server'));
    },
  };
  return plugin;
}

function esbuildPostBuild(optimizer: Optimizer, result: BuildResult, platform: OutputPlatform) {
  if (Array.isArray(result.outputFiles)) {
    const encoder = new TextEncoder();

    for (const out of result.outputFiles) {
      const postBuild = optimizer.postBuild({
        path: out.path,
        text: out.text,
        platform,
      });
      if (postBuild) {
        out.contents = encoder.encode(postBuild.text);
      }
    }
  }
}
