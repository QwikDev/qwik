import type { QRL } from '../shared/qrl/qrl.public';
import { useInvokeContext } from './use-core';
import { type KnownEventNames } from '../shared/jsx/types/jsx-qwik-events';
import type {
  EventHandler,
  EventFromName,
  AllEventKeys,
} from '../shared/jsx/types/jsx-qwik-attributes';
import type { HostElement } from '../shared/types';
import { USE_ON_LOCAL, USE_ON_LOCAL_FLAGS, USE_ON_LOCAL_SEQ_IDX } from '../shared/utils/markers';

export type EventQRL<T extends string = AllEventKeys> =
  | QRL<EventHandler<EventFromName<T>, Element>>
  | undefined;

// <docs markdown="../readme.md#useOn">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOn instead and run `pnpm docs.sync`)
/**
 * Register a listener on the current component's host element.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX. Otherwise, it's adding a JSX listener in the `<div>` is a better idea.
 *
 * @public
 * @see `useOn`, `useOnWindow`, `useOnDocument`.
 */
// </docs>
export const useOn = <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => {
  _useOn('on:', event, eventQrl);
};

// <docs markdown="../readme.md#useOnDocument">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOnDocument instead and run `pnpm docs.sync`)
/**
 * Register a listener on `document`.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX.
 *
 * @public
 * @see `useOn`, `useOnWindow`, `useOnDocument`.
 *
 * ```tsx
 * function useScroll() {
 *   useOnDocument(
 *     'scroll',
 *     $((event) => {
 *       console.log('body scrolled', event);
 *     })
 *   );
 * }
 *
 * const Cmp = component$(() => {
 *   useScroll();
 *   return <div>Profit!</div>;
 * });
 * ```
 */
// </docs>
export const useOnDocument = <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => {
  _useOn('on-document:', event, eventQrl);
};

// <docs markdown="../readme.md#useOnWindow">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOnWindow instead and run `pnpm docs.sync`)
/**
 * Register a listener on `window`.
 *
 * Used to programmatically add event listeners. Useful from custom `use*` methods, which do not
 * have access to the JSX.
 *
 * @public
 * @see `useOn`, `useOnWindow`, `useOnDocument`.
 *
 * ```tsx
 * function useAnalytics() {
 *   useOnWindow(
 *     'popstate',
 *     $((event) => {
 *       console.log('navigation happened', event);
 *       // report to analytics
 *     })
 *   );
 * }
 *
 * const Cmp = component$(() => {
 *   useAnalytics();
 *   return <div>Profit!</div>;
 * });
 * ```
 */
// </docs>
export const useOnWindow = <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => {
  _useOn('on-window:', event, eventQrl);
};

const _useOn = (prefix: string, eventName: string | string[], eventQrl: EventQRL) => {
  const { isAdded, addEvent } = useOnEventsSequentialScope();
  if (isAdded) {
    return;
  }
  if (eventQrl) {
    if (Array.isArray(eventName)) {
      for (const event of eventName) {
        addEvent(`${prefix}${event}`, eventQrl);
      }
    } else {
      addEvent(`${prefix}${eventName}`, eventQrl);
    }
  }
};

/**
 * This hook is like the `useSequentialScope` but it is specifically for `useOn`. This is needed
 * because we want to execute the `useOn` hooks only once and store the event listeners on the host
 * element. From Qwik V2 the component is rerunning when the promise is thrown, so we need to make
 * sure that the event listeners are not added multiple times.
 *
 * - The event listeners are stored in the `USE_ON_LOCAL` property.
 * - The `USE_ON_LOCAL_SEQ_IDX` is used to keep track of the index of the hook that calls this.
 * - The `USE_ON_LOCAL_FLAGS` is used to keep track of whether the event listener has been added or
 *   not.
 */
const useOnEventsSequentialScope = () => {
  const iCtx = useInvokeContext();
  const hostElement = iCtx.$hostElement$;
  const host: HostElement = hostElement as any;
  let onMap = iCtx.$container$.getHostProp<UseOnMap>(host, USE_ON_LOCAL);
  if (onMap === null) {
    onMap = {};
    iCtx.$container$.setHostProp(host, USE_ON_LOCAL, onMap);
  }
  let seqIdx = iCtx.$container$.getHostProp<number>(host, USE_ON_LOCAL_SEQ_IDX);
  if (seqIdx === null) {
    seqIdx = 0;
  }
  iCtx.$container$.setHostProp(host, USE_ON_LOCAL_SEQ_IDX, seqIdx + 1);
  let addedFlags = iCtx.$container$.getHostProp<boolean[]>(host, USE_ON_LOCAL_FLAGS);
  if (addedFlags === null) {
    addedFlags = [];
    iCtx.$container$.setHostProp(host, USE_ON_LOCAL_FLAGS, addedFlags);
  }
  while (addedFlags.length <= seqIdx) {
    addedFlags.push(false);
  }
  const addEvent = (eventName: string, eventQrl: EventQRL<KnownEventNames>) => {
    addedFlags[seqIdx] = true;
    let events = onMap![eventName];
    if (!events) {
      onMap![eventName] = events = [];
    }
    events.push(eventQrl);
  };

  return {
    isAdded: addedFlags[seqIdx],
    addEvent,
  };
};

export type UseOnMap = Record<string, EventQRL<KnownEventNames>[]>;
