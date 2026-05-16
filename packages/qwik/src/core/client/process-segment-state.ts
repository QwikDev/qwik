import { applySubscriptionPatches } from '../control-flow/suspense-utils';
import { wrapDeserializerProxy } from '../shared/serdes/deser-proxy';
import { preprocessState } from '../shared/serdes/index';
import type { SubscriptionPatch } from '../shared/serdes/subscription-patch';
import { QStatePatchAttrSelector } from '../shared/utils/markers';
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
export const processSegmentStateScripts = (container: DomContainer): void => {
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
    if (processedScripts.has(stateScript)) {
      continue;
    }
    processedScripts.add(stateScript);
    processStatePatch(container, stateContainer, stateScript.textContent);
  }
};

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

const processStatePatch = (
  container: DomContainer,
  stateContainer: SegmentStateContainer,
  textContent: string | null
): void => {
  if (textContent) {
    const [rootStart, rawStateData, forwardRefs, subscriptionPatchRootId] = JSON.parse(
      textContent
    ) as [number, unknown[], Array<number | string> | 0 | undefined, number | string | undefined];
    appendStatePatchRoots(container, stateContainer, rootStart, rawStateData);
    mergeForwardRefs(stateContainer, forwardRefs || undefined);
    applySubscriptionPatches(
      container,
      subscriptionPatchRootId === undefined
        ? undefined
        : (stateContainer.$getObjectById$(subscriptionPatchRootId) as SubscriptionPatch[])
    );
  }
};

const appendStatePatchRoots = (
  container: DomContainer,
  stateContainer: SegmentStateContainer,
  rootStart: number,
  rawStateData: unknown[]
): void => {
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
  }
  preprocessState(stateContainer.$rawStateData$, container, undefined, rootStart * 2);
  stateContainer.$stateData$ = wrapDeserializerProxy(
    container,
    stateContainer.$rawStateData$
  ) as unknown[];
  stateContainer.$stateData$.length = stateContainer.$rawStateData$.length / 2;
  stateContainer.$rootForwardRefs$ = stateContainer.$forwardRefs$;
};

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
    if (ref !== -1 && ref !== undefined) {
      rootForwardRefs[i] = ref;
    }
  }
  stateContainer.$forwardRefs$ = rootForwardRefs;
};
