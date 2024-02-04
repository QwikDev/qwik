import type { ObjToProxyMap } from '../../container/container';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import type { SubscriptionManager } from '../../state/common';
import type { ContextId } from '../../use/use-context';
import type { ValueOrPromise } from '../../util/types';
import type { VirtualVNode } from '../client/types';
import type { SsrNode } from '../ssr/types';
import type { Scheduler } from './scheduler';

/// Temporary type left behind which needs to be fixed.
export type fixMeAny = any;

export interface Container2 {
  processJsx(host: HostElement, jsx: JSXOutput): ValueOrPromise<void>;
  handleError(err: any, $host$: HostElement): void;
  getParentHost(host: HostElement): HostElement | null;
  setContext<T>(host: HostElement, context: ContextId<T>, value: T): void;
  resolveContext<T>(host: HostElement, contextId: ContextId<T>): T | undefined;
  readonly $scheduler$: Scheduler;
  readonly $subsManager$: SubscriptionManager;
  readonly $proxyMap$: ObjToProxyMap;
  /// Current language locale
  readonly $locale$: string;
  /// Retrieve Object from paused serialized state.
  readonly getObjectById: (id: number | string) => any;

  setHostProp<T>(host: HostElement, name: string, value: T): void;
  getHostProp<T>(host: HostElement, name: string): T | null;
}

export type HostElement = VirtualVNode | SsrNode;

export interface QElement2 extends HTMLElement {
  qDispatchEvent?: (event: Event) => boolean;
}

export const isContainer2 = (container: any): container is Container2 => {
  return container && typeof container === 'object' && typeof container.setHostProp === 'function';
};
