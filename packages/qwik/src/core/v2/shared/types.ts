import type { SubscriptionManager } from '../../state/common';
import type { VirtualVNode } from '../client/types';

/// Temporary type left behind which needs to be fixed.
export type fixMeAny = any;

export interface Container2 {
  getParentHost(host: HostElement): HostElement | null;
  markForRender(hostElement: VirtualVNode): void;
  $subsManager$: SubscriptionManager;
  // $journal$: VNodeJournalEntry[];
  /// Current language locale
  $locale$: string;
  /// Retrieve Object from paused serialized state.
  readonly getObjectById: (id: number | string) => any;

  setHostProp<T>(host: HostElement, name: string, value: T): void;
  getHostProp<T>(host: HostElement, name: string): T | null;
}

export interface HostElement {
  __brand__: 'HostElement';
}

export interface QElement2 extends HTMLElement {
  qDispatchEvent?: (event: Event) => boolean;
}
