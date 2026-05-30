import { type DomContainer } from './dom-container';
import { onVNodeDataReady } from './process-vnode-data';
import {
  createYieldingIteratorState,
  scheduleYieldingIterator,
  type YieldingIteratorState,
} from './yielding-iterator';
import { type ClientContainer } from './types';

export const enum ContainerDataProcessState {
  NotStarted = 0,
  ProcessingVNode = 1,
  ProcessingState = 2,
  ProcessingStateDone = 3,
}

interface ProcessContainerStateDataState {
  $queue$: Generator<void, void, void>[];
  $active$: YieldingIteratorState<void> | null;
}

export function isContainerReady(container: DomContainer): boolean {
  return container.$containerDataProcessState$ === ContainerDataProcessState.ProcessingStateDone;
}

export function processContainerStateData(
  container: DomContainer,
  iterator: Generator<void, void, void>
): void {
  const state = (container.$containerStateDataState$ ||= {
    $queue$: [],
    $active$: null,
  }) as ProcessContainerStateDataState;
  container.$containerDataProcessState$ = ContainerDataProcessState.ProcessingState;
  state.$queue$.push(iterator);
  scheduleProcessContainerStateData(container, state);
}

export const onContainerDataReady = (container: ClientContainer, callback: () => void): void => {
  const domContainer = container as DomContainer;
  const checkReady = () => {
    if (!isContainerReady(domContainer)) {
      (domContainer.$containerStateReadyCallbacks$ ||= []).push(checkReady);
      return;
    }
    onVNodeDataReady(domContainer.document, () => {
      if (isContainerReady(domContainer)) {
        callback();
      } else {
        checkReady();
      }
    });
  };
  checkReady();
};

export const whenContainerDataReady = <T>(
  container: ClientContainer,
  callback: () => T | Promise<T>
): T | Promise<T> => {
  const domContainer = container as DomContainer;
  if (isContainerReady(domContainer) && domContainer.document.qVNodeDataReady) {
    return callback();
  }
  return new Promise<T>((resolve, reject) => {
    onContainerDataReady(domContainer, () => {
      try {
        resolve(callback());
      } catch (error) {
        reject(error);
      }
    });
  });
};

function scheduleProcessContainerStateData(
  container: DomContainer,
  state: ProcessContainerStateDataState
): void {
  if (state.$active$) {
    return;
  }
  const iterator = state.$queue$.shift();
  if (!iterator) {
    markContainerDataReady(container);
    return;
  }
  state.$active$ = createYieldingIteratorState(
    iterator,
    () => {
      state.$active$ = null;
      scheduleProcessContainerStateData(container, state);
    },
    () => {
      state.$active$ = null;
      container.$containerDataProcessState$ = ContainerDataProcessState.ProcessingStateDone;
    }
  );
  scheduleYieldingIterator(state.$active$);
}

function markContainerDataReady(container: DomContainer): void {
  const state = container.$containerDataProcessState$;
  if (state !== ContainerDataProcessState.ProcessingState) {
    return;
  }
  container.$containerDataProcessState$ = ContainerDataProcessState.ProcessingStateDone;
  container.$containerStateDataState$ = undefined;
  const callbacks = container.$containerStateReadyCallbacks$;
  container.$containerStateReadyCallbacks$ = undefined;
  if (callbacks) {
    for (let i = 0; i < callbacks.length; i++) {
      callbacks[i]();
    }
  }
}
