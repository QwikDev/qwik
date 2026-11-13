import type { EventHandler } from './jsx/types/jsx-qwik-attributes';
import type { Owner } from '../runtime/owner';

export interface QElement extends Element {
  _qDispatch?: Record<string, QDispatchHandler | QDispatchHandler[]>;
  _qSegment?: string;
  _qEventParam?: unknown;
  _qEventParams?: readonly unknown[];
  _qErrorOwner?: Owner;
}

export type CapturedEventHandler = unknown[] & {
  _qHandler: EventHandler;
  _qParamCount?: number;
  _qRun: (captures: CapturedEventHandler, event: Event, element: Element) => unknown;
};

export type QDispatchHandler = EventHandler | CapturedEventHandler;

/** A loader event name with its scope, such as `e:click`. */
export type ScopedEventName = `${string}:${string}`;

export type qWindow = Window & {
  _qwikEv: {
    events: Set<string>;
    roots: Set<Node>;
    /** Add loader commands, new root nodes, or scoped kebabcase eventnames to listen to. */
    push: (
      ...events: (string | (EventTarget & ParentNode) | QwikEvContainerReadyCommand)[]
    ) => void;
    /** Core's re-scan callback per scanned event; the `:` keeps it apart from the members above. */
    [scannedEvent: ScopedEventName]: (() => void) | undefined;
  };
};

export type QwikEvContainerReadyCommand = 0;

export type QwikLoaderEventScope = 'd' | 'dp' | 'w' | 'wp' | 'e' | 'ep';

export const enum QContainerValue {
  PAUSED = 'paused',
  RESUMED = 'resumed',
  HTML = 'html',
  TEXT = 'text',
}

/** @public */
export type SerializationStrategy = 'never' | 'always';
