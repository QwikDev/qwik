import { assertQrl } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import { getContext, HOST_FLAG_NEED_ATTACH_LISTENER } from '../state/context';
import { type Listener, normalizeOnProp } from '../state/listeners';
import { useInvokeContext } from './use-core';
import { type KnownEventNames } from '../render/jsx/types/jsx-qwik-events';
import type {
  EventHandler,
  EventFromName,
  AllEventKeys,
} from '../render/jsx/types/jsx-qwik-attributes';
import type { fixMeAny, HostElement } from '../v2/shared/types';

export type EventQRL<T extends string = AllEventKeys> =
  | QRL<EventHandler<EventFromName<T>, Element>>
  | undefined;

// <docs markdown="../readme.md#useOn">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOn instead)
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
  _useOn(createEventName(event, undefined), createEventName2(event, undefined), eventQrl);
};

// <docs markdown="../readme.md#useOnDocument">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOnDocument instead)
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
  _useOn(createEventName(event, 'document'), createEventName2(event, 'document'), eventQrl);
};

// <docs markdown="../readme.md#useOnWindow">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useOnWindow instead)
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
  _useOn(createEventName(event, 'window'), createEventName2(event, 'window'), eventQrl);
};

const createEventName = (
  event: KnownEventNames | KnownEventNames[],
  eventType: 'window' | 'document' | undefined
) => {
  const formattedEventType = eventType !== undefined ? eventType + ':' : '';
  const res = Array.isArray(event)
    ? event.map((e) => `${formattedEventType}on-${e}`)
    : `${formattedEventType}on-${event}`;
  return res;
};

const createEventName2 = (
  event: KnownEventNames | KnownEventNames[],
  eventType: 'window' | 'document' | undefined
) => {
  const prefix = eventType !== undefined ? eventType + ':' : '';
  const map = (name: string) =>
    prefix + 'on' + name.charAt(0).toUpperCase() + name.substring(1) + '$';
  const res = Array.isArray(event) ? event.map(map) : map(event);
  return res;
};

const _useOn = (
  eventName: string | string[],
  eventName2: string | string[],
  eventQrl: EventQRL
) => {
  if (eventQrl) {
    const invokeCtx = useInvokeContext();
    if (invokeCtx.$container2$) {
      const host: HostElement = invokeCtx.$hostElement$ as fixMeAny;
      const container = invokeCtx.$container2$;
      let onMap = container.getHostProp<UseOnMap>(host, USE_ON_LOCAL);
      if (!onMap) {
        container.setHostProp<UseOnMap>(host, USE_ON_LOCAL, (onMap = {}));
      }
      const addEvent = (eventName: string) => {
        let events = onMap![eventName];
        if (!events) {
          onMap![eventName] = events = [];
        }
        events.push(eventQrl);
      };
      Array.isArray(eventName2) ? eventName2.forEach(addEvent) : addEvent(eventName2);
    } else {
      const elCtx = getContext(
        invokeCtx.$hostElement$,
        invokeCtx.$renderCtx$.$static$.$containerState$
      );
      assertQrl(eventQrl as any);
      if (typeof eventName === 'string') {
        elCtx.li.push([normalizeOnProp(eventName), eventQrl] as Listener);
      } else {
        elCtx.li.push(...eventName.map((name) => [normalizeOnProp(name), eventQrl] as Listener));
      }
      elCtx.$flags$ |= HOST_FLAG_NEED_ATTACH_LISTENER;
    }
  }
};

export const USE_ON_LOCAL = ':on';
export type UseOnMap = Record<string, EventQRL<KnownEventNames>[]>;