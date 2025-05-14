import type { ReplResult, ReplStore } from './types';

// TODO fix useStore to recursively notify subscribers
const deepUpdate = (prev: any, next: any, matcher?: (a: any, b: any) => boolean) => {
  for (const key in next) {
    if (prev[key] && typeof next[key] === 'object' && typeof prev[key] === 'object') {
      deepUpdate(prev[key], next[key]);
    } else {
      if (prev[key] !== next[key]) {
        prev[key] = next[key];
      }
    }
  }
  if (Array.isArray(prev)) {
    for (const item of prev) {
      if (!next.some((nextItem: any) => (matcher ? matcher(nextItem, item) : nextItem === item))) {
        prev.splice(prev.indexOf(item), 1);
      }
    }
  } else {
    for (const key in prev) {
      if (!(key in next)) {
        delete prev[key];
      }
    }
  }
};

const matchByPath = (a: any, b: any) => a.path === b.path;

export const updateReplOutput = async (store: ReplStore, result: ReplResult) => {
  deepUpdate(store.diagnostics, result.diagnostics);
  if (store.htmlResult.rawHtml !== result.htmlResult.rawHtml) {
    store.htmlResult.rawHtml = result.htmlResult.rawHtml;
    store.htmlResult.prettyHtml = result.htmlResult.prettyHtml;
  }

  if (result.diagnostics.length === 0) {
    deepUpdate(store.htmlResult, result.htmlResult);
    deepUpdate(store.transformedModules, result.transformedModules, matchByPath);
    deepUpdate(store.clientBundles, result.clientBundles, matchByPath);
    deepUpdate(store.ssrModules, result.ssrModules, matchByPath);
    if (
      result.events.length !== store.events.length ||
      result.events.some((ev, i) => ev?.start !== store.events[i]?.start)
    ) {
      store.events = result.events;
    }

    if (store.selectedOutputPanel === 'diagnostics' && store.monacoDiagnostics.length === 0) {
      store.selectedOutputPanel = 'app';
    }
  }
};
