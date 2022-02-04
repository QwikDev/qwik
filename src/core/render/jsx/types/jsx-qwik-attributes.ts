/* eslint-disable */

import type { QRL } from '../../../import/qrl.public';
import type { JSXNode } from './jsx-node';

export interface QwikProps {
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

type Event = () => any;
type QrlEvent<T extends Event = Event> = QRL<Event>;

export interface QwikEvents {
  // Host events
  [key: `${'on' | 'onDocument' | 'onWindow'}$:${string}`]: Event;
  [key: `${'on' | 'onDocument' | 'onWindow'}:${string}`]: QrlEvent | QrlEvent[];
}

export interface QwikAttributes extends QwikProps, QwikEvents {}

export type JSXPrimitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | Function
  | RegExp
  | JSXNode<any>;
export type JSXChild = JSXPrimitive | JSXPrimitive[] | Promise<JSXPrimitive>;
export type JSXChildren = JSXChild | JSXChild[];

export interface DOMAttributes<T> extends QwikProps, QwikEvents {
  children?: JSXChildren;
  key?: string;
}
