import type { QRL } from '../../shared/qrl/qrl.public';
import type {
  AllEventKeys,
  EventFromName,
  EventHandler,
} from '../../shared/jsx/types/jsx-qwik-attributes';
import type { KnownEventNames } from '../../shared/jsx/types/jsx-qwik-events';
import { EventNameHtmlScope, fromCamelToKebabCase } from '../../shared/utils/event-names';
import { getActiveInvokeContext } from './invoke-context';
import type { UseOnOptions } from '../../use/use-on';

export type OnHandler<T extends string = AllEventKeys> =
  | QRL<EventHandler<EventFromName<T>, Element>>
  | EventHandler<EventFromName<T>, Element>
  | undefined;

export interface UseOnEvent {
  qrls: NonNullable<OnHandler>[];
  capture: boolean | undefined;
  preventdefault: boolean | undefined;
  stoppropagation: boolean | undefined;
}

export type UseOnMap = Record<string, UseOnEvent>;

export function createOn<T extends KnownEventNames>(
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): void {
  createScopedOn(
    options?.passive ? EventNameHtmlScope.onPassive : EventNameHtmlScope.on,
    event,
    eventQrl,
    options
  );
}

export function createOnDocument<T extends KnownEventNames>(
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): void {
  createScopedOn(
    options?.passive ? EventNameHtmlScope.documentPassive : EventNameHtmlScope.document,
    event,
    eventQrl,
    options
  );
}

export function createOnWindow<T extends KnownEventNames>(
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): void {
  createScopedOn(
    options?.passive ? EventNameHtmlScope.windowPassive : EventNameHtmlScope.window,
    event,
    eventQrl,
    options
  );
}

export function recordUseOnEvent(
  eventKey: string,
  eventQrl: OnHandler | null,
  options?: UseOnOptions
): void {
  if (eventQrl == null) {
    return;
  }

  const invokeContext = getActiveInvokeContext();
  let useOnEvents = invokeContext.useOnEvents;
  if (useOnEvents === null) {
    useOnEvents = invokeContext.useOnEvents = {};
  }

  let event = useOnEvents[eventKey];
  if (event === undefined) {
    event = useOnEvents[eventKey] = {
      qrls: [],
      capture: false,
      preventdefault: false,
      stoppropagation: false,
    };
  }

  event.qrls.push(eventQrl);
  event.capture ||= options?.capture === true;
  event.preventdefault ||= options?.preventdefault === true;
  event.stoppropagation ||= options?.stoppropagation === true;
}

function createScopedOn<T extends KnownEventNames>(
  prefix: EventNameHtmlScope,
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): void {
  if (Array.isArray(event)) {
    for (let i = 0; i < event.length; i++) {
      recordUseOnEvent(prefix + fromCamelToKebabCase(event[i]), eventQrl, options);
    }
  } else {
    recordUseOnEvent(prefix + fromCamelToKebabCase(event), eventQrl, options);
  }
}
