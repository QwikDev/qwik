import type { RollupCache } from 'rollup';
import type { ReplModuleOutput } from '../types';

export interface QwikReplContext {
  html?: string;
  clientModules?: ReplModuleOutput[];
  rollupCache?: RollupCache;
}

const ctxs: { id: string; ctx: QwikReplContext }[] = [];

export const getCtx = (clientId: string, create: boolean) => {
  let c = ctxs.find((r) => r.id === clientId);
  if (!c && create) {
    c = {
      id: clientId,
      ctx: {},
    };
    ctxs.push(c);
    if (ctxs.length > 3) {
      ctxs.shift();
    }
  }
  return c?.ctx;
};
