import { type DomContainer } from './dom-container';
import { ContainerDataProcessState, isContainerReady } from './process-container-state-utils';
import { createYieldingIteratorState, scheduleYieldingIterator } from './yielding-iterator';
import { type ClientContainer } from './types';

export function processStateData(container: DomContainer) {
  if (container.$containerDataProcessState$ >= ContainerDataProcessState.ProcessingState) {
    return;
  }
  container.$containerDataProcessState$ = ContainerDataProcessState.ProcessingState;
  const state = createYieldingIteratorState(
    container.$processContainerData$(),
    () => markContainerDataReady(container),
    () => (container.$containerDataProcessState$ = ContainerDataProcessState.ProcessingStateDone)
  );
  scheduleYieldingIterator(state);
}

export const onContainerDataReady = (container: ClientContainer, callback: () => void): void => {
  const domContainer = container as DomContainer;
  if (isContainerReady(domContainer)) {
    callback();
  } else {
    (domContainer.$containerStateReadyCallbacks$ ||= []).push(callback);
  }
};

export const whenContainerDataReady = <T>(
  container: ClientContainer,
  callback: () => T | Promise<T>
): T | Promise<T> => {
  const domContainer = container as DomContainer;
  if (isContainerReady(domContainer)) {
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

function markContainerDataReady(container: DomContainer): void {
  const state = container.$containerDataProcessState$;
  if (state !== ContainerDataProcessState.ProcessingState) {
    // Allow finish processing state only if we are processing state
    return;
  }
  container.$containerDataProcessState$ = ContainerDataProcessState.ProcessingStateDone;
  // call callbacks gathered before container was ready, meaning state is processing state done
  const callbacks = container.$containerStateReadyCallbacks$;
  container.$containerStateReadyCallbacks$ = undefined;
  if (callbacks) {
    for (let i = 0; i < callbacks.length; i++) {
      callbacks[i]();
    }
  }
}
