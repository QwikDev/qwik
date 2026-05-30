import { applySubscriptionPatches } from '../control-flow/suspense-utils';
import { wrapDeserializerProxy } from '../shared/serdes/deser-proxy';
import { preprocessStateIterator } from '../shared/serdes/preprocess-state';
import type { SubscriptionPatch } from '../shared/serdes/subscription-patch';
import { QStatePatchAttrSelector, QSuspenseResolved } from '../shared/utils/markers';
import { qDev } from '../shared/utils/qdev';
import type { DomContainer } from './dom-container';

type SegmentStateContainer = {
  element: Element;
  $instanceHash$: string;
  $rawStateData$: unknown[];
  $stateData$: unknown[];
  $forwardRefs$: Array<number | string> | null;
  $rootForwardRefs$: Array<number | string> | null;
  $getObjectById$: (id: number | string) => unknown;
};

const processedStatePatchScripts = new WeakMap<DomContainer, WeakSet<Element>>();

/** @internal */
export const processSegmentStateScripts = (container: DomContainer, segmentId?: string): void => {
  const iterator = processSegmentStateScriptsIterator(container, segmentId);
  while (!iterator.next().done) {
    // Run synchronously for existing non-yielded callers.
  }
};

export function* processSegmentStateScriptsIterator(
  container: DomContainer,
  segmentId?: string
): Generator<void, void, void> {
  if (!__EXPERIMENTAL__.suspense) {
    return;
  }
  const stateContainer = container as unknown as SegmentStateContainer;
  const qwikStates = stateContainer.element.querySelectorAll(
    `${stateScriptSelector(stateContainer.$instanceHash$)}${QStatePatchAttrSelector}`
  );
  const processedScripts = getProcessedStatePatchScripts(container);
  for (let i = 0; i < qwikStates.length; i++) {
    const stateScript = qwikStates[i];
    if (segmentId !== undefined && stateScript.getAttribute(QSuspenseResolved) !== segmentId) {
      continue;
    }
    if (processedScripts.has(stateScript)) {
      continue;
    }
    processedScripts.add(stateScript);
    yield* processStatePatch(container, stateContainer, stateScript.textContent);
    yield;
  }
}

const getProcessedStatePatchScripts = (container: DomContainer): WeakSet<Element> => {
  let processedScripts = processedStatePatchScripts.get(container);
  if (!processedScripts) {
    processedScripts = new WeakSet();
    processedStatePatchScripts.set(container, processedScripts);
  }
  return processedScripts;
};

const stateScriptSelector = (instanceHash: string): string => {
  return `script[type="qwik/state"][q\\:instance="${instanceHash}"]`;
};

function* processStatePatch(
  container: DomContainer,
  stateContainer: SegmentStateContainer,
  textContent: string | null
): Generator<void, void, void> {
  if (textContent) {
    const [rootStart, rawStateData, forwardRefs, subscriptionPatchRootId] = JSON.parse(
      textContent
    ) as [number, unknown[], Array<number | string> | 0 | undefined, number | string | undefined];
    yield* appendStatePatchRoots(container, stateContainer, rootStart, rawStateData);
    mergeForwardRefs(stateContainer, forwardRefs || undefined);
    applySubscriptionPatches(
      container,
      subscriptionPatchRootId === undefined
        ? undefined
        : (stateContainer.$getObjectById$(subscriptionPatchRootId) as SubscriptionPatch[])
    );
  }
}

function* appendStatePatchRoots(
  container: DomContainer,
  stateContainer: SegmentStateContainer,
  rootStart: number,
  rawStateData: unknown[]
): Generator<void, void, void> {
  const currentRootCount = stateContainer.$rawStateData$.length / 2;
  if (rootStart !== currentRootCount) {
    if (qDev) {
      throw new Error(
        `Invalid Qwik state patch root start: expected ${currentRootCount}, received ${rootStart}.`
      );
    }
    return;
  }
  for (let i = 0; i < rawStateData.length; i++) {
    stateContainer.$rawStateData$[rootStart * 2 + i] = rawStateData[i];
    yield;
  }
  yield* preprocessStateIterator(
    stateContainer.$rawStateData$,
    container,
    undefined,
    rootStart * 2
  );
  stateContainer.$stateData$ = wrapDeserializerProxy(
    container,
    stateContainer.$rawStateData$
  ) as unknown[];
  stateContainer.$stateData$.length = stateContainer.$rawStateData$.length / 2;
  stateContainer.$rootForwardRefs$ = stateContainer.$forwardRefs$;
}

const mergeForwardRefs = (
  stateContainer: SegmentStateContainer,
  forwardRefs: Array<number | string> | undefined
): void => {
  if (!forwardRefs) {
    return;
  }
  const rootForwardRefs = (stateContainer.$rootForwardRefs$ ||= []);
  for (let i = 0; i < forwardRefs.length; i++) {
    const ref = forwardRefs[i];
    if (ref !== undefined) {
      rootForwardRefs.push(ref);
    }
  }
  stateContainer.$forwardRefs$ = rootForwardRefs;
};
