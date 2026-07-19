import type { EventHandler } from './jsx/types/jsx-qwik-attributes';

export interface QElement extends Element {
  _qDispatch?: Record<string, QDispatchHandler | QDispatchHandler[]>;
  _qSegment?: string;
}

export type CapturedEventHandler = unknown[] & {
  _qHandler: EventHandler;
  _qRun: (captures: CapturedEventHandler, event: Event, element: Element) => unknown;
};

export type QDispatchHandler = EventHandler | CapturedEventHandler;

export type qWindow = Window & {
  _qwikEv: {
    events: Set<string>;
    roots: Set<Node>;
    /** Add loader commands, new root nodes, or scoped kebabcase eventnames to listen to. */
    push: (
      ...events: (string | (EventTarget & ParentNode) | QwikEvContainerReadyCommand)[]
    ) => void;
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

export interface QContainerElement extends Element {
  qFuncs?: Function[];
  _qwikjson_?: unknown;
}

/** @public */
export type SerializationStrategy = 'never' | 'always';
