import type { RollupCache } from 'rollup';
import type { ReplModuleOutput } from '../types';

interface QwikWorkerContext {
  clientModules?: ReplModuleOutput[];
  coreEsmDevCode?: string;
  coreEsmMinCode?: string;
  rollupCache?: RollupCache;
}
export const ctx: QwikWorkerContext = {};
