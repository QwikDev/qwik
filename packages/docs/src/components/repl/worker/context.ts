import type { RollupCache } from 'rollup';
import type { ReplModuleOutput } from '../types';

export interface QwikReplContext {
  clientModules?: ReplModuleOutput[];
  clientCache?: RollupCache;
  ssrCache?: RollupCache;
}

const ctxs: { id: string; ctx: QwikReplContext }[] = [];

export const getCtx = (id: string) => {
  let c = ctxs.find((r) => r.id === id);
  if (!c) {
    c = {
      id,
      ctx: {},
    };
    ctxs.push(c);
    if (ctxs.length > 3) {
      ctxs.shift();
    }
  }
  return c?.ctx;
};
