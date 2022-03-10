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

  'q:obj'?: string;
  'q:host'?: string;
}

type Event = () => any;
type QrlEvent<T extends Event = Event> = QRL<Event>;

export interface QwikEvents {
  // Host events
  [key: `${'on' | 'onDocument' | 'onWindow'}$:${string}`]: Event;
  [key: `${'on' | 'onDocument' | 'onWindow'}:${string}`]: QrlEvent | QrlEvent[];
}

interface CSSProperties {
  [key: string]: string | number;
}

export interface ComponentBaseProps extends QwikEvents {
  class?: string | { [className: string]: boolean };
  className?: string | undefined;
  style?: CSSProperties | undefined;
  key?: string | number;
  id?: string | undefined;

  'q:slot'?: string;
  [key: `h:${string}`]: any;

  children?: JSXChildren;
}
export interface QwikAttributes extends QwikProps, QwikEvents {}

export type JSXChildren =
  | string
  | number
  | boolean
  | null
  | undefined
  | Function
  | RegExp
  | JSXChildren[]
  | Promise<JSXChildren>
  | JSXNode<any>;

export interface DOMAttributes<T> extends QwikProps, QwikEvents {
  children?: JSXChildren;
  key?: string | number;
}
