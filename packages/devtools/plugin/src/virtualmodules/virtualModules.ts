import { VIRTUAL_QWIK_DEVTOOLS_KEY, INNER_USE_HOOK } from '@qwik.dev/devtools/kit';
import { getVirtualIdVariations, isVirtualModuleRequest, normalizeVirtualModuleId } from './ids';
import { createVirtualModuleRegistry } from './registry';

export { transformComponentFile } from '../transforms/component-transform';
export { transformRootFile } from '../transforms/root-transform';
export type { QwikDevtoolsOptions } from '../transforms/root-transform';

// ============================================================================
// Types & Configuration
// ============================================================================

export interface VirtualModuleConfig {
  key: string;
  source: string;
  hookName: string;
}

export const VIRTUAL_MODULES: VirtualModuleConfig[] =
  createVirtualModuleRegistry().modules.map(toVirtualModuleConfig);

// ============================================================================
// Virtual Module Helpers
// ============================================================================

export function normalizeId(id: string): string {
  return normalizeVirtualModuleId(id);
}

export function getIdVariations(key: string): string[] {
  return getVirtualIdVariations(key);
}

export function isVirtualId(id: string, key: string): boolean {
  return isVirtualModuleRequest(id, key);
}

export function findVirtualModule(id: string): VirtualModuleConfig | undefined {
  return VIRTUAL_MODULES.find((module) => isVirtualId(id, module.key));
}

function toVirtualModuleConfig(module: { id: string; load: () => string }): VirtualModuleConfig {
  return {
    key: module.id,
    source: module.load(),
    hookName: module.id === VIRTUAL_QWIK_DEVTOOLS_KEY ? INNER_USE_HOOK : '',
  };
}
