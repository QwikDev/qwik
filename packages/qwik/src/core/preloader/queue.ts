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
      ? // The more likely the bundle, the more simultaneous preloads we want to allow
        Math.max(1, config.$maxIdlePreloads$ * probability)
      : // While the graph is not available, we limit to 2 preloads
        2;
    // When we're 100% sure, everything needs to be queued
    if (probability === 1 || preloadCount < allowedPreloads) {
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
  link.href = bundle.$url$!;
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

export const adjustProbabilities = (
  bundle: BundleImport,
  adjustFactor: number,
  seen?: Set<BundleImport>
) => {
  if (seen?.has(bundle)) {
    return;
  }

  const previousInverseProbability = bundle.$inverseProbability$;
  bundle.$inverseProbability$ *= adjustFactor;
  if (previousInverseProbability - bundle.$inverseProbability$ < 0.01) {
    return;
  }

  if (
    bundle.$state$ < BundleImportState_Preload &&
    bundle.$inverseProbability$ < config.$invPreloadProbability$
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
      const prevAdjust = dep.$factor$;
      /**
       * The chance that a dep won't be loaded is 1-(the chance that the dep will be loaded)*(the
       * chance that the current bundle will be loaded)
       *
       * We can multiply this chance together with all other bundle adjustments to get the chance
       * that a dep will be loaded given all the chances of the other bundles
       */
      const newInverseProbability = 1 - dep.$probability$ * probability;

      /** We need to undo the previous adjustment */
      const factor = newInverseProbability / prevAdjust;
      dep.$factor$ = factor;

      adjustProbabilities(depBundle, factor, seen);
    }
  }
};

export const handleBundle = (name: string, inverseProbability: number) => {
  const bundle = getBundle(name);
  if (bundle && bundle.$inverseProbability$ > inverseProbability) {
    adjustProbabilities(bundle, inverseProbability / bundle.$inverseProbability$);
  }
};

export const preload = (name: string | (number | string)[], probability?: number) => {
  if (base == null || !name.length) {
    return;
  }

  let inverseProbability = probability ? 1 - probability : 0.4;
  if (Array.isArray(name)) {
    // We must process in reverse order to ensure first bundles are handled first
    for (let i = name.length - 1; i >= 0; i--) {
      const item = name[i];
      if (typeof item === 'number') {
        inverseProbability = 1 - item / 10;
      } else {
        handleBundle(item, inverseProbability);
        inverseProbability *= 1.005;
      }
    }
  } else {
    handleBundle(name, inverseProbability);
  }
  if (isBrowser) {
    trigger();
  }
};
