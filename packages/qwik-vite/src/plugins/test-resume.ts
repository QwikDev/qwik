import * as compiler from '@qwik.dev/compiler';
import type { Rollup, ViteDevServer } from 'vite';
import type { TransformModule, TransformModulesOptions, TransformOutput } from '../types';
import { parseId } from './vite-utils';

const { extractRenderRoots, transformModules } = compiler as typeof compiler & {
  extractRenderRoots: (
    path: string,
    code: string
  ) => Array<{
    argumentStart: number;
    argumentEnd: number;
    code: string;
    exportName: string;
  }>;
};

const TEST_RESUME_REGISTRY_NAME = '@qwik.dev/core/testing/resume';
const TEST_RESUME_REGISTRY = Symbol.for(TEST_RESUME_REGISTRY_NAME);
const TEST_RESUME_IMPORTER = '@qwik.dev/core/testing/importer';
const TEST_TARGET = '@qwik.dev/core/testing/target';
const TEST_COMPILED = '@qwik.dev/core/testing/compiled';
const CLIENT_SUFFIX = '.qwik-test-client';

/** @internal */
export interface TestResumeTransformMetadata {
  server: readonly TransformModule[];
  client: readonly TransformModule[];
}

/** @internal */
export function createTestResume() {
  const serverOutputs = new Map<string, [TransformModule, string]>();
  const clientOutputs = new Map<string, [TransformModule, string]>();
  const parentIds = new Map<string, string>();
  const clientModuleIds = new Set<string>();
  const metadata = new Map<string, TestResumeTransformMetadata>();
  const testSources = new Map<string, string>();
  const registry = getTestResumeRegistry();
  let isEnabled = false;
  let testTarget: 'csr' | 'resume' | 'ssr' | undefined;

  const clear = () => {
    serverOutputs.clear();
    clientOutputs.clear();
    parentIds.clear();
    clientModuleIds.clear();
    testSources.clear();
    for (const [id, value] of metadata) {
      if (registry.get(id) === value) {
        registry.delete(id);
      }
    }
    metadata.clear();
  };

  return {
    configure(target: 'csr' | 'resume' | 'ssr' | undefined) {
      const enabled = target !== undefined;
      if (isEnabled && !enabled) {
        clear();
      }
      isEnabled = enabled;
      testTarget = target;
    },
    isEnabled() {
      return isEnabled;
    },
    isResume() {
      return testTarget === 'resume';
    },
    clear,
    getOutput(id: string, isServer: boolean) {
      return isEnabled
        ? isServer
          ? (serverOutputs.get(id) ?? clientOutputs.get(id))
          : (clientOutputs.get(id) ?? serverOutputs.get(id))
        : undefined;
    },
    getParentId(id: string) {
      return isEnabled ? parentIds.get(id) : undefined;
    },
    hasOutput(id: string) {
      return isEnabled && (clientOutputs.has(id) || serverOutputs.has(id));
    },
    getTestSource(id: string) {
      return testSources.get(id);
    },
    prepareTestSource(code: string, id: string, target: 'csr' | 'resume' | 'ssr') {
      const pathId = parseId(id).pathId;
      if (!/\.(?:spec|test|unit)\.[cm]?[jt]sx?$/.test(pathId)) {
        return;
      }
      const roots = extractRenderRoots(pathId, code);
      if (roots.length === 0) {
        return;
      }
      const imports: string[] = [];
      let transformed = code;
      for (let i = roots.length - 1; i >= 0; i--) {
        const root = roots[i];
        const alias = `__qwik_test_root_${i}`;
        const sourceId = `${pathId}.qwik-test-root-${i}.tsx`;
        testSources.set(sourceId, root.code);
        imports.unshift(
          `import { ${root.exportName} as ${alias} } from ${JSON.stringify(sourceId)};`
        );
        transformed =
          transformed.slice(0, root.argumentStart) + alias + transformed.slice(root.argumentEnd);
      }
      return this.injectRuntime(`${imports.join('\n')}\n${transformed}`, id, target);
    },
    injectRuntime(code: string, id: string, target: 'csr' | 'resume' | 'ssr') {
      const transformMetadata = metadata.get(id);
      const registration = transformMetadata
        ? `registry.set(${JSON.stringify(id)}, ${JSON.stringify(transformMetadata)});`
        : '';
      return `${code}\n;(() => {
  const registry = globalThis[Symbol.for(${JSON.stringify(TEST_RESUME_REGISTRY_NAME)})] ||= new Map();
  ${registration}
  globalThis[Symbol.for(${JSON.stringify(TEST_RESUME_IMPORTER)})] = (id) => id === '@qwik.dev/core' ? import('@qwik.dev/core') : import(id);
  globalThis[Symbol.for(${JSON.stringify(TEST_TARGET)})] = ${JSON.stringify(target)};
  globalThis[Symbol.for(${JSON.stringify(TEST_COMPILED)})] = true;
})();`;
    },
    async transform(
      options: TransformModulesOptions,
      parentId: string,
      srcDir: string,
      path: Pick<typeof import('node:path'), 'isAbsolute' | 'join'>,
      normalizePath: (id: string) => string
    ): Promise<TestResumeTransform | undefined> {
      if (!isEnabled) {
        return;
      }

      const [server, client] = await Promise.all([
        transformModules(options),
        transformModules({
          ...options,
          entryStrategy: { type: 'segment' },
          isServer: false,
          stripCtxName: undefined,
          stripEventHandlers: undefined,
          stripExports: undefined,
          regCtxName: undefined,
        }),
      ]);
      const serverRoot = server.modules.find((module) => !isAdditionalFile(module))!;
      const clientRoot = client.modules.find((module) => !isAdditionalFile(module))!;
      const serverModules = server.modules.filter(
        (module) =>
          module !== serverRoot &&
          isAdditionalFile(module) &&
          module.segment?.ctxKind !== 'eventHandler'
      );
      const clientModules = client.modules.filter((module) => isAdditionalFile(module));
      const useClientAliases = testTarget === 'resume';

      registerRootAlias(serverOutputs, serverRoot, parentId, normalizePath);
      clientModuleIds.add(
        registerRootAlias(clientOutputs, clientRoot, parentId, normalizePath, useClientAliases)
      );

      for (const module of serverModules) {
        registerOutput(serverOutputs, module, parentId, srcDir, path, normalizePath);
      }
      for (const module of clientModules) {
        const id = registerOutput(
          clientOutputs,
          module,
          parentId,
          srcDir,
          path,
          normalizePath,
          useClientAliases
        );
        clientModuleIds.add(id);
      }

      const transformMetadata = {
        server: normalizeMetadataModules(server.modules, srcDir, path, normalizePath),
        client: normalizeMetadataModules(
          client.modules,
          srcDir,
          path,
          normalizePath,
          useClientAliases
        ),
      };
      registry.set(parentId, transformMetadata);
      metadata.set(parentId, transformMetadata);

      return {
        output: {
          ...server,
          diagnostics: [...server.diagnostics, ...client.diagnostics],
        },
        root: serverRoot,
        modules: [...serverModules, ...clientModules],
      };
    },
    async resolveId(
      server: ViteDevServer | undefined,
      id: string,
      importerId: string | undefined,
      isServer: boolean,
      normalizePath: (id: string) => string
    ): Promise<Rollup.ResolveIdResult | undefined> {
      if (!isEnabled || !isServer || !server || !importerId || !clientModuleIds.has(importerId)) {
        return;
      }

      const directClientId = toClientId(normalizePath(parseId(id).pathId));
      if (clientOutputs.has(directClientId)) {
        return { id: directClientId, external: false };
      }

      const clientImporter = parentIds.get(importerId) ?? importerId;
      const resolved = await server.environments.client.pluginContainer.resolveId(
        id,
        clientImporter
      );
      if (!resolved) {
        return null;
      }
      const resolvedId = typeof resolved === 'string' ? resolved : resolved.id;
      const normalizedId = normalizePath(parseId(resolvedId).pathId);
      const clientId = toClientId(normalizedId);
      if (clientOutputs.has(clientId)) {
        clientModuleIds.add(clientId);
        return typeof resolved === 'string'
          ? { id: clientId, external: false }
          : { ...resolved, id: clientId, external: false };
      }
      if (normalizedId !== parseId(clientImporter).pathId) {
        clientModuleIds.add(normalizedId);
      }
      return typeof resolved === 'string'
        ? { id: resolved, external: false }
        : { ...resolved, external: false };
    },
  };

  function registerOutput(
    outputs: Map<string, [TransformModule, string]>,
    module: TransformModule,
    parentId: string,
    srcDir: string,
    path: Pick<typeof import('node:path'), 'isAbsolute' | 'join'>,
    normalizePath: (id: string) => string,
    isClient = false
  ): string {
    const outputId = normalizePath(
      path.isAbsolute(module.path) ? module.path : path.join(srcDir, module.path)
    );
    const id = isClient ? toClientId(outputId) : outputId;
    outputs.set(id, [module, parentId]);
    parentIds.set(id, parentId);
    return id;
  }

  function registerRootAlias(
    outputs: Map<string, [TransformModule, string]>,
    module: TransformModule,
    parentId: string,
    normalizePath: (id: string) => string,
    isClient = false
  ): string {
    const outputId = normalizePath(parentId.replace(/\.[cm]?[jt]sx?$/, '.js'));
    const id = isClient ? toClientId(outputId) : outputId;
    outputs.set(id, [module, parentId]);
    parentIds.set(id, parentId);
    return id;
  }
}

interface TestResumeTransform {
  output: TransformOutput;
  root: TransformModule;
  modules: TransformModule[];
}

function getTestResumeRegistry(): Map<string, TestResumeTransformMetadata> {
  const global = globalThis as typeof globalThis & Record<symbol, unknown>;
  const existing = global[TEST_RESUME_REGISTRY];
  if (existing instanceof Map) {
    return existing as Map<string, TestResumeTransformMetadata>;
  }
  const registry = new Map<string, TestResumeTransformMetadata>();
  global[TEST_RESUME_REGISTRY] = registry;
  return registry;
}

function isAdditionalFile(module: TransformModule): boolean {
  return !!(module.isEntry || module.segment);
}

function normalizeMetadataModules(
  modules: readonly TransformModule[],
  srcDir: string,
  path: Pick<typeof import('node:path'), 'isAbsolute' | 'join'>,
  normalizePath: (id: string) => string,
  isClient = false
): TransformModule[] {
  return modules.map((module) => ({
    ...module,
    path: (() => {
      const id = normalizePath(
        path.isAbsolute(module.path) ? module.path : path.join(srcDir, module.path)
      );
      return isClient && isAdditionalFile(module) ? toClientId(id) : id;
    })(),
  }));
}

function toClientId(id: string): string {
  return id.replace(/(\.[^./]+)$/, `${CLIENT_SUFFIX}$1`);
}
