/* eslint-disable */

import type { QRL } from '../../../import/qrl.public';
import type { JSXNode } from './jsx-node';

interface QwikProps {
  class?: string | { [className: string]: boolean };
  innerHTML?: string;

  /**
   *
   */
  'q:slot'?: string;

  /**
   * URL against which relative QRLs should be resolved to.
   */
  'q:base'?: string;
}

type Event<T extends Function = Function> = T;
type QrlEvent<T extends Event = Event> = QRL<Event>;

interface QwikEvents {
  // Host events
  [key: `on$:${string}`]: Event;
  [key: `on:${string}`]: QrlEvent;

  // Document events
  [key: `onDocument$:${string}`]: Event;
  [key: `onDocument:${string}`]: QrlEvent;

  // Window events
  [key: `onWindow$:${string}`]: Event;
  [key: `onWindow:${string}`]: QrlEvent;
}

export type JSXChild = string | number | boolean | null | JSXNode<any>;

export interface DOMAttributes<T> extends QwikProps, QwikEvents {
  children?: JSXChild | JSXChild[];
}
