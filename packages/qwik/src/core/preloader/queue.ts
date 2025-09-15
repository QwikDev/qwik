import { isBrowser } from '@qwik.dev/core/build';
import { base, getBundle, graph } from './bundle-graph';
import { config, doc, loadStart, rel } from './constants';
import type { BundleImport, BundleImports } from './types';
import {
  BundleImportState_Loaded,
  BundleImportState_None,
  BundleImportState_Preload,
  BundleImportState_Queued,
} from './types';
import type { QwikSymbolEvent } from '../shared/jsx/types/jsx-qwik-events';

export const bundles: BundleImports = new Map();
export let shouldResetFactor: boolean;
let queueDirty: boolean;
let preloadCount = 0;
const queue: BundleImport[] = [];

export const log = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.log(
    `Preloader ${Date.now() - loadStart}ms ${preloadCount}/${queue.length} queued>`,
    ...args
  );
};

export const resetQueue = () => {
  bundles.clear();
  queueDirty = false;
  shouldResetFactor = true;
  preloadCount = 0;
  queue.length = 0;
};
export const sortQueue = () => {
  if (queueDirty) {
    queue.sort((a, b) => a.$inverseProbability$ - b.$inverseProbability$);
    queueDirty = false;
  }
};
/**
 * This returns `[probability, url1, url2, probability, url3, ...]` in the way `preload()` expects.
 *
 * `probability` is a number between 0 and 10.
 *
 * The client will use this array to reconstruct the queue.
 */
export const getQueue = () => {
  sortQueue();
  let probability = 0.4;
  const result: (string | number)[] = [];
  for (const b of queue) {
    const nextProbability = Math.round((1 - b.$inverseProbability$) * 10);
    if (nextProbability !== probability) {
      probability = nextProbability;
      result.push(probability);
    }
    result.push(b.$name$);
  }
  return result;
};

/**
 * This is called when a bundle is queued, or finished loading.
 *
 * Because Chrome doesn't treat new modulepreloads as higher priority, we only make
 * maxSimultaneousPreloads links available at a time, so that when a new high priority bundle comes
 * in, it is soon preloaded.
 *
 * We make sure to first preload the high priority items.
 */
export const trigger = () => {
  if (!queue.length) {
    return;
  }
  sortQueue();
  while (queue.length) {
    const bundle = queue[0];
    const inverseProbability = bundle.$inverseProbability$;
    const probability = 1 - inverseProbability;
    const allowedPreloads = graph
      ? config.$maxIdlePreloads$
      : // While the graph is not available, we limit to 5 preloads
        5;
    // When we're 99% sure, everything needs to be queued
    if (probability >= 0.99 || preloadCount < allowedPreloads) {
      queue.shift();
      preloadOne(bundle);
    } else {
      break;
    }
  }
  /**
   * The low priority bundles are opportunistic, and we want to give the browser some breathing room
   * for other resources, so we cycle between 4 and 10 outstanding modulepreloads.
   */
  if (config.$DEBUG$ && !queue.length) {
    const loaded = [...bundles.values()].filter((b) => b.$state$ > BundleImportState_None);
    const waitTime = loaded.reduce((acc, b) => acc + b.$waitedMs$, 0);
    const loadTime = loaded.reduce((acc, b) => acc + b.$loadedMs$, 0);
    log(
      `>>>> done ${loaded.length}/${bundles.size} total: ${waitTime}ms waited, ${loadTime}ms loaded`
    );
  }
};

const preloadOne = (bundle: BundleImport) => {
  if (bundle.$state$ >= BundleImportState_Preload) {
    return;
  }
  preloadCount++;

  const start = Date.now();
  bundle.$waitedMs$ = start - bundle.$createdTs$;
  bundle.$state$ = BundleImportState_Preload;

  config.$DEBUG$ &&
    log(
      `<< load ${Math.round((1 - bundle.$inverseProbability$) * 100)}% after ${`${bundle.$waitedMs$}ms`}`,
      bundle.$name$
    );

  const link = doc.createElement('link');
  // Only bundles with state none are js bundles
  link.href = new URL(`${base}${bundle.$name$}`, doc.baseURI).toString();
  link.rel = rel;
  // Needed when rel is 'preload'
  link.as = 'script';
  // Handle completion of the preload
  link.onload = link.onerror = () => {
    preloadCount--;
    const end = Date.now();
    bundle.$loadedMs$ = end - start;
    bundle.$state$ = BundleImportState_Loaded;
    config.$DEBUG$ && log(`>> done after ${bundle.$loadedMs$}ms`, bundle.$name$);
    // Keep the <head> clean
    link.remove();
    // More bundles may be ready to preload
    trigger();
  };

  doc.head.appendChild(link);
};

/**
 * Adjust the probability of a bundle based on the probability of its dependent bundles, and queue
 * it if it's likely enough to be preloaded.
 *
 * Note that if the probability is 100%, we treat the dynamic imports as 99% sure, and both will be
 * preloaded without limit.
 *
 * We also limit "organic" probability to 98% so they don't get unlimited preloads.
 */
export const adjustProbabilities = (
  bundle: BundleImport,
  newInverseProbability: number,
  seen?: Set<BundleImport>
) => {
  if (seen?.has(bundle)) {
    return;
  }

  const previousInverseProbability = bundle.$inverseProbability$;
  bundle.$inverseProbability$ = newInverseProbability;
  // Don't propagate tiny changes
  if (previousInverseProbability - bundle.$inverseProbability$ < 0.01) {
    return;
  }

  if (
    // don't queue until we have initialized the preloader
    base != null &&
    bundle.$state$ < BundleImportState_Preload
  ) {
    if (bundle.$state$ === BundleImportState_None) {
      bundle.$state$ = BundleImportState_Queued;
      queue.push(bundle);
      config.$DEBUG$ &&
        log(`queued ${Math.round((1 - bundle.$inverseProbability$) * 100)}%`, bundle.$name$);
    }

    // It's in the queue, so we need to re-sort it
    queueDirty = true;
  }

  if (bundle.$deps$) {
    seen ||= new Set();
    seen.add(bundle);
    const probability = 1 - bundle.$inverseProbability$;
    for (const dep of bundle.$deps$) {
      const depBundle = getBundle(dep.$name$)!;
      if (depBundle.$inverseProbability$ === 0) {
        // it's already at max probability
        continue;
      }
      /**
       * The chance that a dep won't be loaded is 1-(the chance that the dep will be loaded)*(the
       * chance that the current bundle will be loaded).
       *
       * We can multiply this chance together with all other bundle adjustments to get the chance
       * that a dep will be loaded given all the chances of the other bundles.
       *
       * But when we're very likely to load the current bundle, make the dynamic imports very likely
       * too.
       */
      let newInverseProbability: number;
      if (probability === 1 || (probability >= 0.99 && depsCount < 100)) {
        depsCount++;
        // we're loaded at max probability, so elevate dynamic imports to 99% sure
        newInverseProbability = Math.min(0.01, 1 - dep.$importProbability$);
      } else {
        const newInverseImportProbability = 1 - dep.$importProbability$ * probability;
        /** We need to undo the previous adjustment */
        const prevAdjust = dep.$factor$;
        const factor = newInverseImportProbability / prevAdjust;
        // limit organic probability to 98%
        newInverseProbability = Math.max(0.02, depBundle.$inverseProbability$ * factor);
        dep.$factor$ = factor;
      }

      adjustProbabilities(depBundle, newInverseProbability, seen);
    }
  }
};

export const handleBundle = (name: string, inverseProbability: number) => {
  const bundle = getBundle(name);
  if (bundle && bundle.$inverseProbability$ > inverseProbability) {
    adjustProbabilities(bundle, inverseProbability);
  }
};

let depsCount: number;

export const preload = (name: string | (number | string)[], probability?: number) => {
  if (!name?.length) {
    return;
  }
  depsCount = 0;

  let inverseProbability = probability ? 1 - probability : 0.4;
  if (Array.isArray(name)) {
    // We must process in reverse order to ensure first bundles are handled first
    for (let i = name.length - 1; i >= 0; i--) {
      const item = name[i];
      if (typeof item === 'number') {
        inverseProbability = 1 - item / 10;
      } else {
        handleBundle(item, inverseProbability);
      }
    }
  } else {
    handleBundle(name, inverseProbability);
  }
  if (isBrowser) {
    trigger();
  }
};

if (isBrowser) {
  // Get early hints from qwikloader
  document.addEventListener('qsymbol', (ev) => {
    const { symbol, href } = (ev as QwikSymbolEvent).detail;
    // the qrl class doesn't emit href, we don't need to preload
    if (href) {
      const hash = symbol.slice(symbol.lastIndexOf('_') + 1);
      preload(hash, 1);
    }
  });
}
