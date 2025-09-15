import { unwrapStore } from '@qwik.dev/core/internal';
import type { ReplResult, ReplStore } from '../types';

// Maybe we should change useStore to recursively notify subscribers when a top-level property changes
const deepUpdate = (prev: any, next: any) => {
  for (const key in next) {
    if (prev[key] && typeof next[key] === 'object' && typeof prev[key] === 'object') {
      deepUpdate(prev[key], next[key]);
    } else {
      if (unwrapStore(prev[key]) !== next[key]) {
        prev[key] = next[key];
      }
    }
  }
  if (Array.isArray(prev)) {
    if (prev.length !== next.length) {
      prev.length = next.length;
    }
  } else {
    for (const key in prev) {
      if (!(key in next)) {
        delete prev[key];
      }
    }
  }
};

export const updateReplOutput = async (store: ReplStore, result: ReplResult) => {
  deepUpdate(store.diagnostics, result.diagnostics);
  deepUpdate(store.transformedModules, result.transformedModules);
  deepUpdate(store.clientBundles, result.clientBundles);
  deepUpdate(store.ssrModules, result.ssrModules);

  if (result.diagnostics.length === 0) {
    if (result.html && store.html !== result.html) {
      store.html = result.html;
      store.events = result.events;
      store.reload++;
    }
  }

  if (store.selectedOutputPanel === 'diagnostics' && store.monacoDiagnostics.length === 0) {
    store.selectedOutputPanel = 'app';
  }
};
