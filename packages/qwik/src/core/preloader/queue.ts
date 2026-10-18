import type { QwikSymbolEvent } from '../shared/jsx/types/jsx-qwik-events';
import { createMacroTask } from '../shared/platform/next-tick';
import { base, getBundle } from './bundle-graph';
import { config, doc, isBrowser, rel, yieldInterval } from './constants';
import type { BundleImport, BundleImports, ImportProbability } from './types';
import {
  BundleImportState_Loaded,
  BundleImportState_None,
  BundleImportState_Preload,
  BundleImportState_Queued,
} from './types';
import { setPreloader } from './bridge';

export const bundles: BundleImports = new Map();
export let shouldResetFactor: boolean;
let queueDirty: boolean;
let requestPriority = 0;
const inFlight = new Map<BundleImport, HTMLLinkElement>();
// Import cycles must not release active render slots.
const renderInFlight = new Set<BundleImport>();
const queue: BundleImport[] = [];

export const nextTriggerMacroTask = createMacroTask(trigger);
export const nextAdjustmentMacroTask = createMacroTask(processPendingAdjustments);
let isTriggerScheduled = false;
let isAdjustmentScheduled = false;
let isProcessingAdjustments = false;

type AdjustmentFrame = {
  $bundle$: BundleImport;
  $inverseProbability$: number;
  $priority$: number;
  $renderPriority$?: number;
  $seen$?: Set<BundleImport>;
  $deps$?: ImportProbability[];
  $index$?: number;
};

const adjustmentStack: AdjustmentFrame[] = [];

const isNeeded = (bundle: BundleImport) => 1 - bundle.$inverseProbability$ >= 0.99;

export const sortQueue = () => {
  if (queueDirty) {
    queue.sort(
      (a, b) =>
        Number(isNeeded(b)) - Number(isNeeded(a)) ||
        (isNeeded(a) ? 0 : b.$renderPriority$ - a.$renderPriority$) ||
        b.$priority$ - a.$priority$ ||
        (a.$renderPriority$ ? 0 : a.$inverseProbability$ - b.$inverseProbability$)
    );
    queueDirty = false;
  }
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
  let rendering = renderInFlight.size;
  const deadline = performance.now() + yieldInterval;
  let shouldYield = false;
  while (queue.length) {
    const bundle = queue[0];
    if (
      isNeeded(bundle) ||
      (bundle.$renderPriority$ ? rendering : inFlight.size) < config.$maxIdlePreloads$
    ) {
      queue.shift();
      if (bundle.$renderPriority$ && !isNeeded(bundle)) {
        renderInFlight.add(bundle);
        rendering++;
      }
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
}

const enqueueAdjustment = (
  bundle: BundleImport,
  inverseProbability: number,
  seen?: Set<BundleImport>,
  priority = bundle.$priority$
) => {
  // Keep existing work on the stack hot and append new roots behind it.
  adjustmentStack.unshift({
    $bundle$: bundle,
    $inverseProbability$: inverseProbability,
    $priority$: priority,
    $seen$: seen,
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
    if (depBundle.$inverseProbability$ === 0 && depBundle.$priority$ >= frame.$priority$) {
      return true;
    }

    const probability = 1 - bundle.$inverseProbability$;
    let newInverseProbability: number;
    if (probability >= 0.99 && dep.$importProbability$ === 1) {
      // Only guaranteed dependencies inherit the importer's required priority.
      newInverseProbability = bundle.$inverseProbability$;
    } else {
      const newInverseImportProbability = 1 - dep.$importProbability$ * probability;
      /** We need to undo the previous adjustment */
      const prevAdjust = dep.$factor$;
      const factor = newInverseImportProbability / prevAdjust;
      // limit organic probability to 98%
      newInverseProbability = Math.max(0.02, depBundle.$inverseProbability$ * factor);
      dep.$factor$ = newInverseImportProbability;
    }

    adjustmentStack.push({
      $bundle$: depBundle,
      $inverseProbability$: newInverseProbability,
      $priority$: frame.$priority$,
      $renderPriority$:
        dep.$isRender$ || dep.$importProbability$ === 1
          ? frame.$renderPriority$ || (isNeeded(bundle) ? frame.$priority$ : 0)
          : 0,
      $seen$: frame.$seen$,
    });
    return true;
  }

  if (frame.$seen$?.has(bundle)) {
    adjustmentStack.pop();
    return false;
  }

  const previousInverseProbability = bundle.$inverseProbability$;
  const hasHigherProbability = previousInverseProbability - frame.$inverseProbability$ >= 0.01;
  const hasHigherPriority = frame.$priority$ > bundle.$priority$;
  const hasHigherRenderPriority = (frame.$renderPriority$ || 0) > bundle.$renderPriority$;
  if (!hasHigherProbability && !hasHigherPriority && !hasHigherRenderPriority) {
    adjustmentStack.pop();
    return false;
  }
  bundle.$inverseProbability$ = Math.min(previousInverseProbability, frame.$inverseProbability$);
  if (hasHigherPriority) {
    bundle.$priority$ = frame.$priority$;
    queueDirty = true;
  }
  if (hasHigherRenderPriority) {
    bundle.$renderPriority$ = frame.$renderPriority$!;
    queueDirty = true;
  }
  frame.$priority$ = bundle.$priority$;
  frame.$renderPriority$ = bundle.$renderPriority$;
  if (isNeeded(bundle) || bundle.$renderPriority$) {
    inFlight.get(bundle)?.removeAttribute('fetchpriority');
  }

  if (
    // don't queue until we have initialized the preloader
    base != null &&
    bundle.$state$ < BundleImportState_Preload
  ) {
    if (bundle.$state$ === BundleImportState_None) {
      bundle.$state$ = BundleImportState_Queued;
      queue.push(bundle);
    }

    // It's in the queue, so we need to re-sort it
    queueDirty = true;
  }

  if (bundle.$deps$?.length) {
    const seen = frame.$seen$ || new Set<BundleImport>();
    seen.add(bundle);
    frame.$seen$ = seen;
    frame.$deps$ =
      frame.$renderPriority$ || isNeeded(bundle)
        ? [...bundle.$deps$].sort((a, b) => Number(!!b.$isRender$) - Number(!!a.$isRender$))
        : bundle.$deps$;
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
  const deadline = isBrowser ? performance.now() + yieldInterval : 0;
  let processed = false;

  while (adjustmentStack.length) {
    processed = true;
    const checkDeadline = processAdjustmentFrame();
    if (isBrowser && checkDeadline && performance.now() >= deadline) {
      if (!isAdjustmentScheduled) {
        isAdjustmentScheduled = true;
        nextAdjustmentMacroTask();
      }
      break;
    }
  }

  isProcessingAdjustments = false;

  if (processed && isBrowser) {
    nextTriggerMacroTask();
  }
}

const preloadOne = (bundle: BundleImport) => {
  if (bundle.$state$ >= BundleImportState_Preload) {
    return;
  }
  const start = performance.now();
  bundle.$waitedMs$ = start - bundle.$createdTs$;
  bundle.$state$ = BundleImportState_Preload;

  const link = doc.createElement('link');
  inFlight.set(bundle, link);
  // Only bundles with state none are js bundles
  link.href = new URL(`${base}${bundle.$name$}`, doc.baseURI).toString();
  link.rel = rel;
  // Needed when rel is 'preload'
  link.as = 'script';
  if (!isNeeded(bundle) && !bundle.$renderPriority$) {
    link.setAttribute('fetchpriority', 'low');
  }
  // Handle completion of the preload
  link.onload = link.onerror = () => {
    inFlight.delete(bundle);
    renderInFlight.delete(bundle);
    const end = performance.now();
    bundle.$loadedMs$ = end - start;
    bundle.$state$ = BundleImportState_Loaded;
    // Keep the <head> clean
    link.remove();
    // More bundles may be ready to preload
    nextTriggerMacroTask();
  };

  doc.head.appendChild(link);
  // Selected renders also require their complete static import graph.
  if (bundle.$renderPriority$) {
    let hasStaticDependencies = false;
    for (const dependency of bundle.$deps$ || []) {
      if (dependency.$importProbability$ === 1) {
        const imported = getBundle(dependency.$name$)!;
        if (!isNeeded(imported)) {
          enqueueAdjustment(imported, 0, undefined, bundle.$priority$);
          hasStaticDependencies = true;
        }
      }
    }
    if (hasStaticDependencies) {
      nextAdjustmentMacroTask();
    }
  }
};

/**
 * Adjust the probability of a bundle based on the probability of its dependent bundles, and queue
 * it if it's likely enough to be preloaded.
 *
 * Guaranteed dependencies inherit needed priority; speculative dependencies keep their
 * probabilities.
 *
 * We also limit "organic" probability to 98% so they don't get unlimited preloads.
 */
export const adjustProbabilities = (
  bundle: BundleImport,
  newInverseProbability: number,
  seen?: Set<BundleImport>
) => {
  enqueueAdjustment(bundle, newInverseProbability, seen);
  if (isBrowser) {
    nextAdjustmentMacroTask();
  } else {
    processPendingAdjustments();
  }
};

export const handleBundle = (name: string, inverseProbability: number, priority = 0) => {
  const bundle = getBundle(name);
  if (bundle) {
    enqueueAdjustment(bundle, inverseProbability, undefined, priority);
  }
};

export const preload = (item: string | string[], probability?: number) => {
  if (!item?.length) {
    return;
  }
  const inverseProbability = probability ? 1 - probability : 0.4;
  const priority = (probability ?? 0) >= 0.99 ? ++requestPriority : 0;
  if (Array.isArray(item)) {
    for (let i = 0; i < item.length; i++) {
      const bundle = item[i];
      handleBundle(bundle, inverseProbability, priority);
    }
  } else {
    handleBundle(item, inverseProbability, priority);
  }
  if (isBrowser) {
    nextAdjustmentMacroTask();
  } else {
    processPendingAdjustments();
  }
};

if (isBrowser) {
  setPreloader(preload);

  // Include runtime QRL usage, which has no href.
  document.addEventListener('qsymbol', (ev) => {
    const { symbol } = (ev as QwikSymbolEvent).detail;
    const hash = symbol.slice(symbol.lastIndexOf('_') + 1);
    preload(hash, 1);
  });
}
