import { createMacroTask } from '../shared/platform/next-tick';
import { base, getBundle, isWaitingForGraph } from './bundle-graph';
import { config, doc, isBrowser, rel, yieldInterval } from './constants';
import type { BundleDep, BundleImport, BundleImports } from './types';
import {
  BundleImportState_Loaded,
  BundleImportState_None,
  BundleImportState_Preload,
  BundleImportState_Queued,
} from './types';

export const bundles: BundleImports = new Map();
let queueDirty: boolean;
const inFlight = new Set<BundleImport>();
const queue: BundleImport[] = [];

export const nextTriggerMacroTask = createMacroTask(trigger);
export const nextAdjustmentMacroTask = createMacroTask(processPendingAdjustments);
let isTriggerScheduled = false;
let isAdjustmentScheduled = false;
let isProcessingAdjustments = false;

type AdjustmentFrame = {
  $bundle$: BundleImport;
  $inverseProbability$: number;
  /** The rank of the bundle that leads here, which a bundle with no QRL takes over */
  $importerRank$: number;
  $isStaticImport$?: boolean;
  $rendersPage$?: boolean;
  $isReplay$?: boolean;
  $deps$?: BundleDep[];
  $index$?: number;
};

const adjustmentStack: AdjustmentFrame[] = [];

const isHighestPriority = (bundle: BundleImport) => 1 - bundle.$inverseProbability$ >= 0.99;

// Read live: a speculative preload may since have been requested at probability 1
const isHighestPriorityInFlight = () => {
  for (const bundle of inFlight) {
    if (isHighestPriority(bundle)) {
      return true;
    }
  }
  return false;
};

export const sortQueue = () => {
  if (queueDirty) {
    queue.sort((a, b) => a.$inverseProbability$ - b.$inverseProbability$ || a.$rank$ - b.$rank$);
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
  const deadline = performance.now() + yieldInterval;
  let shouldYield = false;
  while (queue.length) {
    const bundle = queue[0];
    // We want to preload all the transitive static (1) and dynamic (0.99) dependencies, throttled by the user defined maxIdlePreloads.
    // Speculative preloads wait while highest priority bundles load, so they don't take their bandwidth.
    if (
      isHighestPriority(bundle) ||
      (!isWaitingForGraph &&
        !adjustmentStack.length &&
        inFlight.size < config.$maxIdlePreloads$ &&
        !isHighestPriorityInFlight())
    ) {
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
}

const enqueueAdjustment = (
  bundle: BundleImport,
  inverseProbability: number,
  rendersPage?: boolean,
  isReplay?: boolean
) => {
  // Keep existing work on the stack hot and append new roots behind it.
  adjustmentStack.unshift({
    $bundle$: bundle,
    $inverseProbability$: inverseProbability,
    $importerRank$: 0,
    $rendersPage$: rendersPage,
    $isReplay$: isReplay,
  });
};

const HIGHEST_KIND = 3;

/** On the page handlers go first; for a page still to render, components do. */
const getRank = (bundle: BundleImport, frame: AdjustmentFrame) => {
  const kind = bundle.$kind$;
  const ownRank = kind
    ? frame.$rendersPage$
      ? HIGHEST_KIND - kind
      : kind - 1
    : frame.$importerRank$;
  return frame.$isStaticImport$ ? Math.min(ownRank, frame.$importerRank$) : ownRank;
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

    adjustmentStack.push({
      $bundle$: depBundle,
      // A highest priority bundle makes everything it reaches highest priority too
      $inverseProbability$: isHighestPriority(bundle)
        ? dep.$isStatic$
          ? 0
          : 0.01
        : bundle.$inverseProbability$,
      $importerRank$: bundle.$rank$,
      $isStaticImport$: dep.$isStatic$,
      $rendersPage$: frame.$rendersPage$,
    });
    return true;
  }

  const previousInverseProbability = bundle.$inverseProbability$;
  const rank = getRank(bundle, frame);
  const isStronger = frame.$inverseProbability$ < previousInverseProbability;
  const isBetterRanked =
    frame.$inverseProbability$ === previousInverseProbability && rank < bundle.$rank$;
  if (!frame.$isReplay$ && !isStronger && !isBetterRanked) {
    adjustmentStack.pop();
    return false;
  }
  if (isStronger) {
    bundle.$inverseProbability$ = frame.$inverseProbability$;
  }
  bundle.$rank$ = isStronger || frame.$isReplay$ ? rank : Math.min(rank, bundle.$rank$);
  if (frame.$rendersPage$) {
    bundle.$rendersPage$ = true;
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
    frame.$deps$ = bundle.$deps$;
    frame.$index$ = 0;
    return false;
  }

  adjustmentStack.pop();
  return false;
};

const scheduleAdjustments = () => {
  if (!isAdjustmentScheduled) {
    isAdjustmentScheduled = true;
    nextAdjustmentMacroTask();
  }
};

function processPendingAdjustments() {
  isAdjustmentScheduled = false;
  if (isProcessingAdjustments || !adjustmentStack.length) {
    return;
  }

  isProcessingAdjustments = true;
  const deadline = isBrowser ? performance.now() + yieldInterval : 0;
  let processed = false;

  while (adjustmentStack.length) {
    processed = true;
    const checkDeadline = processAdjustmentFrame();
    if (isBrowser && checkDeadline && performance.now() >= deadline) {
      scheduleAdjustments();
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
  inFlight.add(bundle);

  bundle.$state$ = BundleImportState_Preload;

  const link = doc.createElement('link');
  // Only bundles with state none are js bundles
  link.href = new URL(`${base}${bundle.$name$}`, doc.baseURI).toString();
  link.rel = rel;
  // Needed when rel is 'preload'
  link.as = 'script';
  if (!isHighestPriority(bundle)) {
    link.setAttribute('fetchpriority', 'low');
  }
  // Handle completion of the preload
  const onSettled = (state: number) => {
    inFlight.delete(bundle);
    bundle.$state$ = state;
    // Keep the <head> clean
    link.remove();
    // More bundles may be ready to preload
    nextTriggerMacroTask();
  };
  link.onload = () => onSettled(BundleImportState_Loaded);
  link.onerror = () => {
    onSettled(BundleImportState_None);
    retryFailedPreload(bundle);
  };

  doc.head.appendChild(link);
};

const RETRY_DELAY_MS = 1000;
const failedBundles = new Set<BundleImport>();

const queueBundle = (bundle: BundleImport) => {
  if (bundle.$state$ === BundleImportState_None) {
    bundle.$state$ = BundleImportState_Queued;
    queue.push(bundle);
    queueDirty = true;
    nextTriggerMacroTask();
  }
};

const retryFailedBundlesOnceOnline = () => {
  for (const bundle of failedBundles) {
    bundle.$failures$ = 0;
    queueBundle(bundle);
  }
};

// Browsers refetch a failed module from Chromium 156 and Firefox 155; no Safari release yet.
const retryFailedPreload = (bundle: BundleImport) => {
  if (!failedBundles.size) {
    doc.defaultView!.addEventListener('online', retryFailedBundlesOnceOnline);
  }
  failedBundles.add(bundle);
  bundle.$failures$ = (bundle.$failures$ || 0) + 1;
  if (bundle.$failures$ > 1 || navigator.onLine === false) {
    return;
  }
  if (isHighestPriority(bundle)) {
    queueBundle(bundle);
  } else {
    setTimeout(queueBundle, RETRY_DELAY_MS, bundle);
  }
};

/** Replay a buffered hint after its dependencies become available. */
export const replayBundle = (bundle: BundleImport) => {
  enqueueAdjustment(bundle, bundle.$inverseProbability$, bundle.$rendersPage$, true);
  if (isBrowser) {
    scheduleAdjustments();
  } else {
    processPendingAdjustments();
  }
};

export const handleBundle = (name: string, inverseProbability: number, rendersPage?: boolean) => {
  const bundle = getBundle(name);
  if (bundle) {
    enqueueAdjustment(bundle, inverseProbability, rendersPage);
  }
};

/** `isPageToRender` is for a page the user may go to: its components are needed first. */
export const preload = (
  item: string | string[],
  probability?: number,
  isPageToRender?: boolean
) => {
  if (!item?.length) {
    return;
  }
  const inverseProbability = probability ? 1 - probability : 0.4;
  if (Array.isArray(item)) {
    for (let i = 0; i < item.length; i++) {
      handleBundle(item[i], inverseProbability, isPageToRender);
    }
  } else {
    handleBundle(item, inverseProbability, isPageToRender);
  }
  if (isBrowser) {
    scheduleAdjustments();
  } else {
    processPendingAdjustments();
  }
};

/**
 * Used during SSR: the bundles the client preloader would fetch for this hint, in its order. The
 * server shares the preloader's state across requests, so forget this request's adjustments.
 */
export const getPreloadOrder = (item: string[], probability?: number) => {
  try {
    preload(item, probability);
    sortQueue();
    return queue.map((bundle) => bundle.$name$);
  } finally {
    bundles.clear();
    queue.length = 0;
    adjustmentStack.length = 0;
    isProcessingAdjustments = false;
  }
};
