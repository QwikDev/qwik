import type { RollupCache } from 'rollup';
import type { ReplModuleOutput } from '../types';

interface QwikWorkerContext {
  clientModules?: ReplModuleOutput[];
  coreEsmCode?: string;
  rollupCache?: RollupCache;
}
export const ctx: QwikWorkerContext = {};

export const ROLLUP_VERSION = '2.70.2';
export const PRETTIER_VERSION = '2.6.2';
export const TERSER_VERSION = '5.12.1';
