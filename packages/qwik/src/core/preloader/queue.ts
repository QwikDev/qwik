import { createMacroTask } from '../shared/platform/next-tick';
import { base, getBundle, isWaitingForGraph } from './bundle-graph';
import { config, doc, isBrowser, rel, yieldInterval } from './constants';
import type { BundleImport, BundleImports, ImportProbability } from './types';
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
  $hintOrder$: number;
  $isReplay$?: boolean;
  $seen$?: Set<BundleImport>;
  $deps$?: ImportProbability[];
  $index$?: number;
};

const adjustmentStack: AdjustmentFrame[] = [];
let hintCount = 0;

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
    queue.sort(
      (a, b) => a.$inverseProbability$ - b.$inverseProbability$ || b.$hintOrder$ - a.$hintOrder$
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
  hintOrder: number,
  isReplay?: boolean
) => {
  // Keep existing work on the stack hot and append new roots behind it.
  adjustmentStack.unshift({
    $bundle$: bundle,
    $inverseProbability$: inverseProbability,
    $hintOrder$: hintOrder,
    $isReplay$: isReplay,
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
    if (probability === 1 || probability >= 0.99) {
      // bundle is requested at max probability, so elevate all its transitive static and dynamic deps to 99% sure
      newInverseProbability = Math.min(0.01, 1 - dep.$importProbability$);
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
      $hintOrder$: frame.$hintOrder$,
      $seen$: frame.$seen$,
    });
    return true;
  }

  if (frame.$seen$?.has(bundle)) {
    adjustmentStack.pop();
    return false;
  }

  const wasHighestPriority = isHighestPriority(bundle);
  const previousInverseProbability = bundle.$inverseProbability$;
  bundle.$inverseProbability$ = Math.min(previousInverseProbability, frame.$inverseProbability$);
  if (frame.$inverseProbability$ <= previousInverseProbability) {
    bundle.$hintOrder$ = frame.$hintOrder$;
    queueDirty = true;
  }
  // Replay and highest priority transitions must reach dependencies.
  if (
    !frame.$isReplay$ &&
    wasHighestPriority === isHighestPriority(bundle) &&
    previousInverseProbability - bundle.$inverseProbability$ < 0.01
  ) {
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
  link.onload = link.onerror = () => {
    inFlight.delete(bundle);
    bundle.$state$ = BundleImportState_Loaded;
    // Keep the <head> clean
    link.remove();
    // More bundles may be ready to preload
    nextTriggerMacroTask();
  };

  doc.head.appendChild(link);
};

/** Replay a buffered hint after its dependencies become available. */
export const replayBundle = (bundle: BundleImport) => {
  enqueueAdjustment(bundle, bundle.$inverseProbability$, bundle.$hintOrder$, true);
  if (isBrowser) {
    scheduleAdjustments();
  } else {
    processPendingAdjustments();
  }
};

export const handleBundle = (name: string, inverseProbability: number) => {
  const bundle = getBundle(name);
  if (bundle) {
    enqueueAdjustment(bundle, inverseProbability, hintCount);
  }
};

export const preload = (item: string | string[], probability?: number) => {
  if (!item?.length) {
    return;
  }
  const inverseProbability = probability ? 1 - probability : 0.4;
  hintCount++;
  if (Array.isArray(item)) {
    for (let i = 0; i < item.length; i++) {
      handleBundle(item[i], inverseProbability);
    }
  } else {
    handleBundle(item, inverseProbability);
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
    for (const bundle of bundles.values()) {
      const deps = bundle.$deps$ || [];
      for (let i = 0; i < deps.length; i++) {
        deps[i].$factor$ = 1;
      }
    }
    bundles.clear();
    queue.length = 0;
    adjustmentStack.length = 0;
    isProcessingAdjustments = false;
  }
};

const IN_VIEW_PROBABILITY = 0.8;
const ELEMENT_HANDLER_ATTRIBUTE_PREFIX = 'q-e';
const ORDERED_NODE_SNAPSHOT_TYPE = 7;

const addHandlerChunksOf = (element: Element, chunks: string[]) => {
  const attributes = element.attributes;
  for (let i = 0; i < attributes.length; i++) {
    const { name, value } = attributes[i];
    if (!name.startsWith(ELEMENT_HANDLER_ATTRIBUTE_PREFIX)) {
      continue;
    }
    const qrls = value.split('|');
    for (let j = 0; j < qrls.length; j++) {
      const [chunk, , , otherChunks] = qrls[j].split('#');
      if (chunk) {
        chunks.push(chunk, ...(otherChunks ? otherChunks.split(',') : []));
      }
    }
  }
};

export const preloadHandlersInView = () => {
  const observer = new IntersectionObserver((entries) => {
    const chunksInView: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const { target, isIntersecting } = entries[i];
      if (isIntersecting) {
        observer.unobserve(target);
        addHandlerChunksOf(target, chunksInView);
      }
    }
    preload(chunksInView, IN_VIEW_PROBABILITY);
  });
  const elementsWithHandlers = doc.evaluate(
    `//*[@*[starts-with(name(),'${ELEMENT_HANDLER_ATTRIBUTE_PREFIX}')]]`,
    doc,
    null,
    ORDERED_NODE_SNAPSHOT_TYPE
  );
  for (let i = 0; i < elementsWithHandlers.snapshotLength; i++) {
    observer.observe(elementsWithHandlers.snapshotItem(i) as Element);
  }
};
