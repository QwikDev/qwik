import type { OutputBundle, PluginContext } from 'rollup';
import type { Plugin as VitePlugin, UserConfig } from 'vite';
import type { QwikManifest } from '../types';
import { QWIK_CORE_ID, QWIK_CORE_INTERNAL_ID, type QwikBuildTarget } from './plugin';
import {
  createBuildWorkerCoreChunkResolver,
  QWIK_WORKER_CORE_SENTINEL,
  rewriteWorkerCorePlaceholders,
} from './worker-qrl-chunks';

export const QWIK_WORKER_CORE_ID = '@qwik-worker-core';

type WorkerConfig = NonNullable<UserConfig['worker']>;

const QWIK_WORKER_CORE_CODE = `
export { setPlatform } from '@qwik.dev/core';
export { _deserialize, _invokeApply, _newInvokeContext } from '@qwik.dev/core/internal';
`;

export const isQwikWorkerCoreId = (id: string) => {
  return id.endsWith(QWIK_WORKER_CORE_ID);
};

export const loadQwikWorkerCore = () => {
  return {
    moduleSideEffects: false,
    code: QWIK_WORKER_CORE_CODE,
  };
};

export const emitQwikWorkerCoreChunk = (ctx: PluginContext) => {
  ctx.emitFile({
    id: QWIK_WORKER_CORE_ID,
    name: 'qwik-worker-core',
    type: 'chunk',
    preserveSignature: 'allow-extension',
  });
};

export const getQwikWorkerConfig = (
  userWorkerConfig: UserConfig['worker'],
  target: QwikBuildTarget,
  viteCommand: 'build' | 'serve'
): UserConfig['worker'] => {
  if ((target !== 'client' && target !== 'ssr') || viteCommand !== 'build') {
    return userWorkerConfig;
  }

  return {
    ...userWorkerConfig,
    format: 'es',
    plugins: createQwikWorkerPlugins(userWorkerConfig?.plugins),
  };
};

export const rewriteClientWorkerCorePlaceholders = (rollupBundle: OutputBundle) => {
  const workerCoreChunk = Object.values(rollupBundle).find(
    (output) => output.type === 'chunk' && output.facadeModuleId === QWIK_WORKER_CORE_ID
  );
  const resolveWorkerCorePath = workerCoreChunk
    ? createBuildWorkerCoreChunkResolver(workerCoreChunk.fileName)
    : undefined;
  rewriteWorkerCorePlaceholdersInBundle(rollupBundle, (fileName) =>
    resolveWorkerCorePath?.(fileName)
  );
};

export const rewriteSsrWorkerCorePlaceholders = (
  rollupBundle: OutputBundle,
  manifest: QwikManifest | null
) => {
  const workerCoreChunkFileName = getWorkerCoreChunkFileNameFromManifest(manifest);
  const resolveWorkerCorePath = workerCoreChunkFileName
    ? createBuildWorkerCoreChunkResolver(workerCoreChunkFileName)
    : undefined;
  rewriteWorkerCorePlaceholdersInBundle(rollupBundle, (fileName) =>
    resolveWorkerCorePath?.(fileName)
  );
};

const createQwikWorkerCoreExternalPlugin = (): VitePlugin => {
  return {
    name: 'vite-plugin-qwik-worker-core-external',
    enforce: 'pre',
    resolveId(id) {
      if (id === QWIK_CORE_ID || id === QWIK_CORE_INTERNAL_ID) {
        return {
          id: QWIK_WORKER_CORE_SENTINEL,
          external: true,
        };
      }
      return null;
    },
  };
};

const createQwikWorkerPlugins = (userWorkerPlugins: WorkerConfig['plugins']) => {
  return () => {
    const plugins =
      typeof userWorkerPlugins === 'function'
        ? userWorkerPlugins()
        : Array.isArray(userWorkerPlugins)
          ? userWorkerPlugins
          : [];
    return [...plugins, createQwikWorkerCoreExternalPlugin()];
  };
};

const rewriteWorkerCorePlaceholdersInBundle = (
  rollupBundle: OutputBundle,
  resolveWorkerCorePath: (fileName: string) => string | undefined
) => {
  for (const output of Object.values(rollupBundle)) {
    if (output.type === 'chunk') {
      output.code = rewriteWorkerCorePlaceholders(output.code, () =>
        resolveWorkerCorePath(output.fileName)
      );
    } else if (output.type === 'asset' && typeof output.source === 'string') {
      output.source = rewriteWorkerCorePlaceholders(output.source, () =>
        resolveWorkerCorePath(output.fileName)
      );
    }
  }
};

const getWorkerCoreChunkFileNameFromManifest = (manifest: QwikManifest | null) => {
  if (!manifest) {
    return undefined;
  }
  const fileName = Object.keys(manifest.bundles).find((fileName) =>
    /(?:^|[/\\])qwik-worker-core(?:[.-]|$)/.test(fileName)
  );
  if (!fileName) {
    return undefined;
  }
  return fileName === 'build' || fileName.startsWith('build/') || /[/\\]build[/\\]/.test(fileName)
    ? fileName
    : `build/${fileName}`;
};
