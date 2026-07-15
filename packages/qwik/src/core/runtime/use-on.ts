import type { QRL } from '../shared/qrl/qrl.public';
import type {
  AllEventKeys,
  EventFromName,
  EventHandler,
} from '../shared/jsx/types/jsx-qwik-attributes';
import type { KnownEventNames } from '../shared/jsx/types/jsx-qwik-events';
import {
  EventNameHtmlScope,
  fromCamelToKebabCase,
  getEventDataFromHtmlAttribute,
} from '../shared/utils/event-names';
import { getActiveInvokeContextOrNull, type RuntimeInvokeContext } from './invoke-context';
import type { MaybeNodeOutput } from '../utils/nodes';
import { setEvent } from '../dom/event/event';
import type { CapturedEventHandler, QDispatchHandler, QElement } from '../shared/types';
import { isDev } from '@qwik.dev/core/build';

interface UseOnOptionsBase {
  capture?: boolean;
  stoppropagation?: boolean;
}

/** @public */
export type UseOnOptions = UseOnOptionsBase &
  (
    | {
        passive?: boolean;
        preventdefault?: never;
      }
    | {
        passive?: never;
        preventdefault?: boolean;
      }
  );

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

/** @public */
export const useOn = <T extends KnownEventNames>(
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): void => {
  recordUseOn(
    options?.passive ? EventNameHtmlScope.onPassive : EventNameHtmlScope.on,
    event,
    eventQrl,
    options
  );
};

/** @public */
export const useOnDocument = <T extends KnownEventNames>(
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): void => {
  recordUseOn(
    options?.passive ? EventNameHtmlScope.documentPassive : EventNameHtmlScope.document,
    event,
    eventQrl,
    options
  );
};

/** @public */
export const useOnWindow = <T extends KnownEventNames>(
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): void => {
  recordUseOn(
    options?.passive ? EventNameHtmlScope.windowPassive : EventNameHtmlScope.window,
    event,
    eventQrl,
    options
  );
};

function recordUseOnEvent(
  eventKey: string,
  eventQrl: OnHandler | null,
  invokeContext: RuntimeInvokeContext,
  options?: UseOnOptions
): void {
  if (eventQrl == null) {
    return;
  }
  let useOnEvents = invokeContext.useOnEvents;
  if (useOnEvents === undefined) {
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

export function recordUseOn<T extends KnownEventNames>(
  prefix: EventNameHtmlScope,
  event: T | T[],
  eventQrl: OnHandler<T>,
  options?: UseOnOptions
): boolean {
  const invokeContext = getActiveInvokeContextOrNull();
  if (invokeContext === null) {
    return false;
  }
  if (Array.isArray(event)) {
    for (let i = 0; i < event.length; i++) {
      recordUseOnEvent(prefix + fromCamelToKebabCase(event[i]), eventQrl, invokeContext, options);
    }
  } else {
    recordUseOnEvent(prefix + fromCamelToKebabCase(event), eventQrl, invokeContext, options);
  }
  return true;
}

export function applyUseOnToCsrOutput(
  output: MaybeNodeOutput,
  useOnEvents: UseOnMap,
  document: Document
): MaybeNodeOutput {
  const element = findFirstElement(output);
  let placeholder: Element | null = null;
  let result = output;
  for (const key in useOnEvents) {
    const event = useOnEvents[key];
    let target = element;
    let eventKey = key;
    if (target === null) {
      if (
        key === 'q-e:qvisible' ||
        key.startsWith(EventNameHtmlScope.document) ||
        key.startsWith(EventNameHtmlScope.window)
      ) {
        if (placeholder === null) {
          placeholder = document.createElement('script');
          placeholder.setAttribute('hidden', '');
          result =
            result == null
              ? placeholder
              : Array.isArray(result)
                ? [...result, placeholder]
                : [result, placeholder];
        }
        target = placeholder;
        if (key === 'q-e:qvisible') {
          eventKey = 'q-d:qinit';
        }
      } else {
        if (isDev) {
          console.warn(`useOn('${key}') has no element carrier.`);
        }
        continue;
      }
    }
    const scopedName = eventKey.slice(2);
    const existing = (target as QElement)._qDispatch?.[scopedName];
    const handlers =
      existing === undefined
        ? event.qrls
        : Array.isArray(existing) && (existing as CapturedEventHandler)._qRun === undefined
          ? [...(existing as QDispatchHandler[]), ...event.qrls]
          : [existing, ...event.qrls];
    setEvent(target, eventKey, handlers as QDispatchHandler[]);
    if (event.capture || event.preventdefault || event.stoppropagation) {
      const [, eventName] = getEventDataFromHtmlAttribute(eventKey);
      event.capture && target.setAttribute(`capture:${eventName}`, '');
      event.preventdefault && target.setAttribute(`preventdefault:${eventName}`, '');
      event.stoppropagation && target.setAttribute(`stoppropagation:${eventName}`, '');
    }
  }
  return result;
}

export function reapplyUseOnContexts(
  output: MaybeNodeOutput,
  invokeContext: RuntimeInvokeContext | null,
  document: Document
): MaybeNodeOutput {
  if (
    invokeContext === null ||
    (invokeContext.useOnEvents === undefined && invokeContext.inheritedUseOnEvents === undefined)
  ) {
    return output;
  }
  let result = output;
  const own = invokeContext.useOnEvents;
  if (own !== undefined) {
    result = applyUseOnToCsrOutput(result, own, document);
  }
  const inherited = invokeContext.inheritedUseOnEvents;
  if (inherited !== undefined) {
    for (let i = 0; i < inherited.length; i++) {
      result = applyUseOnToCsrOutput(result, inherited[i], document);
    }
  }
  return result;
}

function findFirstElement(output: MaybeNodeOutput): Element | null {
  if (Array.isArray(output)) {
    for (let i = 0; i < output.length; i++) {
      if (output[i].nodeType === 1) {
        return output[i] as Element;
      }
    }
    return null;
  }
  return output != null && (output as Node).nodeType === 1 ? (output as Element) : null;
}
