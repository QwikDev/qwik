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
  readonly $getObjectById$: (id: number | string) => any;

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

/**
 * A friendly name tag for a VirtualVNode.
 * 
 * Theses are used to give a name to a VirtualVNode. This is useful for debugging and testing.
 * 
 * The name is only added in development mode and is not included in production builds.
 */
export const DEBUG_TYPE = 'q:type';

export enum VirtualType {
  Virtual = 'V',
  Fragment = 'F',
  DerivedSignal = 'D',
  Awaited = 'A',
  Component = 'C',
  InlineComponent = 'I',
  Projection = 'P',
}

const START = '\x1b[34m';
const END = '\x1b[0m';

export const VirtualTypeName: Record<string, string> = {
  [VirtualType.Virtual]: /* ********* */ START + 'Virtual' + END, //  
  [VirtualType.Fragment]: /* ******** */ START + 'Fragment' + END, //  
  [VirtualType.DerivedSignal]: /* ********** */ START + 'Signal' + END, //  
  [VirtualType.Awaited]: /* ********* */ START + 'Awaited' + END, //  
  [VirtualType.Component]: /* ******* */ START + 'Component' + END, //  
  [VirtualType.InlineComponent]: /* * */ START + 'InlineComponent' + END, //
  [VirtualType.Projection]: /* ****** */ START + 'Projection' + END //
};
