import { createMacroTask } from '../shared/platform/next-tick';
import { base, getBundle, isComponentChunk, isWaitingForGraph } from './bundle-graph';
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
  $priority$: number;
  $importerRank$: number;
  $hintOrder$: number;
  $isStaticImport$?: boolean;
  $isPageToRender$?: boolean;
  $isReplay$?: boolean;
  $deps$?: BundleDep[];
  $index$?: number;
};

const adjustmentStack: AdjustmentFrame[] = [];
let hintCount = 0;

const isHighestPriority = (bundle: BundleImport) => bundle.$priority$ >= 0.99;

// Read live: a speculative preload may since have been requested at priority 1
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
      (a, b) => b.$priority$ - a.$priority$ || a.$rank$ - b.$rank$ || b.$hintOrder$ - a.$hintOrder$
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
  priority: number,
  hintOrder: number,
  isPageToRender?: boolean,
  isReplay?: boolean
) => {
  // Keep existing work on the stack hot and append new roots behind it.
  adjustmentStack.unshift({
    $bundle$: bundle,
    $priority$: priority,
    $hintOrder$: hintOrder,
    $importerRank$: 0,
    $isPageToRender$: isPageToRender,
    $isReplay$: isReplay,
  });
};

const HIGHEST_KIND = 3;
export const UNRANKED = HIGHEST_KIND;

const getRank = (bundle: BundleImport, frame: AdjustmentFrame) => {
  const kind = bundle.$kind$;
  const ownRank = kind
    ? frame.$isPageToRender$
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
    if (depBundle.$priority$ === 1) {
      return true;
    }

    adjustmentStack.push({
      $bundle$: depBundle,
      $priority$: isHighestPriority(bundle) ? (dep.$isStatic$ ? 1 : 0.99) : bundle.$priority$,
      $hintOrder$: frame.$hintOrder$,
      $importerRank$: bundle.$rank$,
      $isStaticImport$: dep.$isStatic$,
      $isPageToRender$: frame.$isPageToRender$,
    });
    return true;
  }

  const previousPriority = bundle.$priority$;
  const rank = getRank(bundle, frame);
  const isStronger = frame.$priority$ > previousPriority;
  const isBetterRanked = frame.$priority$ === previousPriority && rank < bundle.$rank$;
  const isWeaker = frame.$priority$ < previousPriority;
  const isNewer = !isWeaker && !isStronger && frame.$hintOrder$ > bundle.$hintOrder$;
  if (isStronger || isNewer) {
    bundle.$hintOrder$ = frame.$hintOrder$;
    queueDirty = true;
  }
  const isUnchanged = !frame.$isReplay$ && !isStronger && !isBetterRanked;
  if (isWeaker || (isUnchanged && !isNewer)) {
    adjustmentStack.pop();
    return false;
  }
  if (isStronger) {
    bundle.$priority$ = frame.$priority$;
    bundle.$isPageToRender$ = frame.$isPageToRender$;
  }
  bundle.$rank$ = isStronger ? rank : Math.min(rank, bundle.$rank$);

  if (
    // don't queue until we have initialized the preloader
    base != null &&
    bundle.$state$ < BundleImportState_Preload
  ) {
    if (bundle.$state$ === BundleImportState_None && !isUnchanged) {
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
  enqueueAdjustment(bundle, bundle.$priority$, bundle.$hintOrder$, bundle.$isPageToRender$, true);
  if (isBrowser) {
    scheduleAdjustments();
  } else {
    processPendingAdjustments();
  }
};

export const handleBundle = (name: string, priority: number, isPageToRender?: boolean) => {
  const bundle = getBundle(name);
  if (bundle) {
    enqueueAdjustment(bundle, priority, hintCount, isPageToRender);
  }
};

const PAGE_PRIORITY = 0.6;

export const preload = (item: string | string[], priority?: number, isPageToRender?: boolean) => {
  if (!item?.length) {
    return;
  }
  const hintPriority = priority || PAGE_PRIORITY;
  hintCount++;
  if (Array.isArray(item)) {
    for (let i = 0; i < item.length; i++) {
      handleBundle(item[i], hintPriority, isPageToRender);
    }
  } else {
    handleBundle(item, hintPriority, isPageToRender);
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
export const getPreloadOrder = (item: string[], priority?: number) => {
  try {
    preload(item, priority);
    sortQueue();
    return queue.map((bundle) => bundle.$name$);
  } finally {
    bundles.clear();
    queue.length = 0;
    adjustmentStack.length = 0;
    isProcessingAdjustments = false;
  }
};

const INTENT_PRIORITY = 0.9;
const IN_VIEW_PRIORITY = 0.8;
const HANDLER_ATTRIBUTE_PREFIX = 'q-';
const ELEMENT_HANDLER_ATTRIBUTE_PREFIX = 'q-e';
const ORDERED_NODE_SNAPSHOT_TYPE = 7;
const STATE_SCRIPT_SELECTOR = 'script[type="qwik/state"]';
const CHUNK_NAME_IN_STATE = /"([^"\\]+\.[mc]?js)"/g;

const addHandlerChunksOf = (
  element: Element,
  chunks: string[],
  attributePrefix = ELEMENT_HANDLER_ATTRIBUTE_PREFIX
) => {
  const attributes = element.attributes;
  for (let i = 0; attributes && i < attributes.length; i++) {
    const { name, value } = attributes[i];
    if (!name.startsWith(attributePrefix)) {
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

const findElementsWithHandlers = () =>
  doc.evaluate(
    `//*[@*[starts-with(name(),'${HANDLER_ATTRIBUTE_PREFIX}')]]`,
    doc,
    null,
    ORDERED_NODE_SNAPSHOT_TYPE
  );

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
    preload(chunksInView, IN_VIEW_PRIORITY);
  });
  const elementsWithHandlers = findElementsWithHandlers();
  for (let i = 0; i < elementsWithHandlers.snapshotLength; i++) {
    observer.observe(elementsWithHandlers.snapshotItem(i) as Element);
  }
};

export const preloadChunksNamedInPage = () => {
  const chunks: string[] = [];
  const elementsWithHandlers = findElementsWithHandlers();
  for (let i = 0; i < elementsWithHandlers.snapshotLength; i++) {
    addHandlerChunksOf(
      elementsWithHandlers.snapshotItem(i) as Element,
      chunks,
      HANDLER_ATTRIBUTE_PREFIX
    );
  }
  const stateScripts = doc.querySelectorAll(STATE_SCRIPT_SELECTOR);
  for (let i = 0; i < stateScripts.length; i++) {
    const state = stateScripts[i].textContent!;
    let chunkName: RegExpExecArray | null;
    while ((chunkName = CHUNK_NAME_IN_STATE.exec(state))) {
      if (!isComponentChunk(chunkName[1])) {
        chunks.push(chunkName[1]);
      }
    }
  }
  preload(chunks);
};

export const preloadHandlersOnIntent = () => {
  let lastHint: string;
  const preloadHandlersUnder = (event: Event) => {
    const chunks: string[] = [];
    const path = event.composedPath() as Element[];
    for (let i = 0; i < path.length; i++) {
      addHandlerChunksOf(path[i], chunks);
    }
    const hint = chunks.join();
    if (hint !== lastHint) {
      lastHint = hint;
      preload(chunks, INTENT_PRIORITY);
    }
  };
  doc.addEventListener('pointerover', preloadHandlersUnder, true);
  doc.addEventListener('focusin', preloadHandlersUnder, true);
};
