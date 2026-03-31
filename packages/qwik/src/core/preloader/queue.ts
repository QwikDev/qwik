import { isBrowser } from '@qwik.dev/core/build';
import { base, getBundle, graph } from './bundle-graph';
import { config, doc, loadStart, rel, yieldInterval } from './constants';
import type { BundleImport, BundleImports, ImportProbability } from './types';
import {
  BundleImportState_Loaded,
  BundleImportState_None,
  BundleImportState_Preload,
  BundleImportState_Queued,
} from './types';
import type { QwikSymbolEvent } from '../shared/jsx/types/jsx-qwik-events';
import { createMacroTask } from '../shared/platform/next-tick';
import { isServerPlatform } from '../shared/platform/platform';

export const bundles: BundleImports = new Map();
export let shouldResetFactor: boolean;
let queueDirty: boolean;
let preloadCount = 0;
const queue: BundleImport[] = [];

export const nextTriggerMacroTask = createMacroTask(trigger);
export const nextAdjustmentMacroTask = createMacroTask(processPendingAdjustments);
let isTriggerScheduled = false;
let isAdjustmentScheduled = false;
let isProcessingAdjustments = false;
const shouldYieldInBrowser = import.meta.env.TEST ? !isServerPlatform() : isBrowser;

type AdjustmentContext = {
  $depsCount$: number;
};

type AdjustmentFrame = {
  $bundle$: BundleImport;
  $inverseProbability$: number;
  $seen$?: Set<BundleImport>;
  $context$: AdjustmentContext;
  $deps$?: ImportProbability[];
  $index$?: number;
};

const adjustmentStack: AdjustmentFrame[] = [];

export const log = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.log(
    `Preloader ${performance.now() - loadStart}ms ${preloadCount}/${queue.length} queued>`,
    ...args
  );
};

export const resetQueue = () => {
  bundles.clear();
  queueDirty = false;
  shouldResetFactor = true;
  preloadCount = 0;
  queue.length = 0;
  adjustmentStack.length = 0;
  isTriggerScheduled = false;
  isAdjustmentScheduled = false;
  isProcessingAdjustments = false;
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
  for (let i = 0; i < queue.length; i++) {
    const b = queue[i];
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
function trigger() {
  isTriggerScheduled = false;
  if (!queue.length) {
    return;
  }
  sortQueue();
  const deadline = performance.now() + yieldInterval;
  let shouldYield = false;
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
      if (performance.now() >= deadline) {
        shouldYield = true;
        break;
      }
    } else {
      break;
    }
  }
  if (shouldYield && queue.length && !isTriggerScheduled) {
    isTriggerScheduled = true;
    nextTriggerMacroTask();
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
}

const enqueueAdjustment = (
  bundle: BundleImport,
  inverseProbability: number,
  context: AdjustmentContext,
  seen?: Set<BundleImport>
) => {
  // Keep existing work on the stack hot and append new roots behind it.
  adjustmentStack.unshift({
    $bundle$: bundle,
    $inverseProbability$: inverseProbability,
    $seen$: seen,
    $context$: context,
  });
};

const processAdjustmentFrame = () => {
  const frame = adjustmentStack[adjustmentStack.length - 1]!;
  const bundle = frame.$bundle$;

  if (frame.$deps$) {
    const index = frame.$index$!;
    if (index >= frame.$deps$.length) {
      adjustmentStack.pop();
      return false;
    }

    const dep = frame.$deps$[index];
    frame.$index$ = index + 1;

    const depBundle = getBundle(dep.$name$)!;
    if (depBundle.$inverseProbability$ === 0) {
      return true;
    }

    const probability = 1 - bundle.$inverseProbability$;
    let newInverseProbability: number;
    if (probability === 1 || (probability >= 0.99 && frame.$context$.$depsCount$ < 100)) {
      frame.$context$.$depsCount$++;
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

    adjustmentStack.push({
      $bundle$: depBundle,
      $inverseProbability$: newInverseProbability,
      $seen$: frame.$seen$,
      $context$: frame.$context$,
    });
    return true;
  }

  if (frame.$seen$?.has(bundle)) {
    adjustmentStack.pop();
    return false;
  }

  const previousInverseProbability = bundle.$inverseProbability$;
  bundle.$inverseProbability$ = frame.$inverseProbability$;
  // Don't propagate tiny changes
  if (previousInverseProbability - bundle.$inverseProbability$ < 0.01) {
    adjustmentStack.pop();
    return false;
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

  if (bundle.$deps$?.length) {
    const seen = frame.$seen$ || new Set<BundleImport>();
    seen.add(bundle);
    frame.$seen$ = seen;
    frame.$deps$ = bundle.$deps$;
    frame.$index$ = 0;
    return false;
  }

  adjustmentStack.pop();
  return false;
};

function processPendingAdjustments() {
  if (isProcessingAdjustments || !adjustmentStack.length) {
    return;
  }

  isAdjustmentScheduled = false;
  isProcessingAdjustments = true;
  const deadline = shouldYieldInBrowser ? performance.now() + yieldInterval : 0;
  let processed = false;

  while (adjustmentStack.length) {
    processed = true;
    const checkDeadline = processAdjustmentFrame();
    if (shouldYieldInBrowser && checkDeadline && performance.now() >= deadline) {
      if (!isAdjustmentScheduled) {
        isAdjustmentScheduled = true;
        nextAdjustmentMacroTask();
      }
      break;
    }
  }

  isProcessingAdjustments = false;

  if (processed && shouldYieldInBrowser) {
    nextTriggerMacroTask();
  }
}

const preloadOne = (bundle: BundleImport) => {
  if (bundle.$state$ >= BundleImportState_Preload) {
    return;
  }
  preloadCount++;

  const start = performance.now();
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
    const end = performance.now();
    bundle.$loadedMs$ = end - start;
    bundle.$state$ = BundleImportState_Loaded;
    config.$DEBUG$ && log(`>> done after ${bundle.$loadedMs$}ms`, bundle.$name$);
    // Keep the <head> clean
    link.remove();
    // More bundles may be ready to preload
    nextTriggerMacroTask();
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
  enqueueAdjustment(bundle, newInverseProbability, { $depsCount$: 0 }, seen);
  if (shouldYieldInBrowser) {
    nextAdjustmentMacroTask();
  } else {
    processPendingAdjustments();
  }
};

export const handleBundle = (
  name: string,
  inverseProbability: number,
  context?: AdjustmentContext
) => {
  const bundle = getBundle(name);
  if (bundle && bundle.$inverseProbability$ > inverseProbability) {
    if (context) {
      enqueueAdjustment(bundle, inverseProbability, context);
    } else {
      adjustProbabilities(bundle, inverseProbability);
    }
  }
};

export const preload = (name: string | (number | string)[], probability?: number) => {
  if (!name?.length) {
    return;
  }

  let inverseProbability = probability ? 1 - probability : 0.4;
  const context = { $depsCount$: 0 };
  if (Array.isArray(name)) {
    // We must process in reverse order to ensure first bundles are handled first
    for (let i = name.length - 1; i >= 0; i--) {
      const item = name[i];
      if (typeof item === 'number') {
        inverseProbability = 1 - item / 10;
      } else {
        handleBundle(item, inverseProbability, context);
      }
    }
  } else {
    handleBundle(name, inverseProbability, context);
  }
  if (shouldYieldInBrowser) {
    nextAdjustmentMacroTask();
  } else {
    processPendingAdjustments();
  }
};

if (import.meta.env.TEST ? !isServerPlatform() : isBrowser) {
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
