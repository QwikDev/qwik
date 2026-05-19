import { type DomContainer } from './dom-container';

/**
 * Flow: Not started to Processing VNode Data to Processing VNode Data Done to Processing State to
 * Processing State Done to Now container is ready
 */
export const enum ContainerDataProcessState {
  NotStarted = 0,
  ProcessingVNode = 1,
  ProcessingVNodeDone = 2,
  ProcessingState = 3,
  ProcessingStateDone = 4,
}

export function isContainerReady(container: DomContainer): boolean {
  return container.$containerDataProcessState$ === ContainerDataProcessState.ProcessingStateDone;
}
