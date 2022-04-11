/* eslint-disable */

import type { Ref } from '../../../use/use-store.public';
import type { QRL } from '../../../import/qrl.public';
import type { JSXNode } from './jsx-node';

export interface QwikProps {
  class?: string | { [className: string]: boolean };
  innerHTML?: string;
  dangerouslySetInnerHTML?: string;
  ref?: Ref<Element>;

  /**
   *
   */
  'q:slot'?: string;

  /**
   * URL against which relative QRLs should be resolved to.
   */
  'q:obj'?: string;
  'q:host'?: string;
  'q:version'?: string;
  'q:container'?: '';
  [key: `preventDefault:${string}`]: boolean;
}

type EventHandler<Type = Event> = (event: Type, element: Element) => any;
type QrlEvent<Type = Event> = QRL<EventHandler<Type>>;

export interface QwikEvents {
  [key: `on${string}$`]: EventHandler | undefined;
  [key: `on${string}Qrl`]: QrlEvent | QrlEvent[] | undefined;
}

export interface QwikEvent {
  [key: `on${string}$`]: EventHandler | undefined;
  [key: `on${string}Qrl`]: QrlEvent | QrlEvent[] | undefined;
}

interface CSSProperties {
  [key: string]: string | number;
}

export interface ComponentBaseProps {
  class?: string | { [className: string]: boolean };
  className?: string | undefined;
  style?: CSSProperties | string | undefined;
  key?: string | number;
  id?: string | undefined;
  ref?: Ref<Element>;

  'q:slot'?: string;

  [key: `host:on${string}$`]: EventHandler;
  [key: `host:on${string}Qrl`]: QrlEvent | QrlEvent[];
  [key: `host:${string}`]: any;

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
