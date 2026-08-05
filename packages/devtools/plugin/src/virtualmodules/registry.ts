import type { DevtoolsCapability, VirtualModuleDefinition } from '@qwik.dev/devtools/kit';
import { getDevtoolsCapabilities } from '../capabilities';
import { isVirtualModuleRequest, toResolvedVirtualModuleId } from './ids';

export interface VirtualModuleLoadResult {
  code: string;
  map: { mappings: '' };
}

export interface VirtualModuleRegistry {
  modules: VirtualModuleDefinition[];
  find(id: string): VirtualModuleDefinition | undefined;
  resolveId(id: string): string | undefined;
  load(id: string): VirtualModuleLoadResult | undefined;
}

export function createVirtualModuleRegistry(
  capabilities: DevtoolsCapability[] = getDevtoolsCapabilities()
): VirtualModuleRegistry {
  const modules = capabilities.flatMap((capability) => capability.virtualModules ?? []);
  assertUniqueVirtualModuleIds(modules);
  const find = (id: string) => modules.find((module) => isVirtualModuleRequest(id, module.id));

  return {
    modules,
    find,
    resolveId(id) {
      const module = find(id);
      return module ? toResolvedVirtualModuleId(module.id) : undefined;
    },
    load(id) {
      const module = find(id);
      return module ? { code: module.load(), map: { mappings: '' } } : undefined;
    },
  };
}

function assertUniqueVirtualModuleIds(modules: VirtualModuleDefinition[]): void {
  const seen = new Set<string>();

  for (const module of modules) {
    if (seen.has(module.id)) {
      throw new Error(`Duplicate virtual module id: ${module.id}`);
    }
    seen.add(module.id);
  }
}
